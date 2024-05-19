import * as k8s from '@kubernetes/client-node';
import * as Async from 'async';
import * as https from 'https';
import { ResourceMetadata, ResourceMetadataId } from './resource-metadata'; 
import { WatchEvent, WatchEventPhase, WatchSpec, WatchEventHandler } from './watch-event';
import { IncomingMessage } from 'http';

export interface Response {
  statusCode?:number;
  statusMessage?:string;
  body?:any;
}

interface UntypedWatchEvent {
  phase: WatchEventPhase;
  resource: k8s.KubernetesObject;
  meta: ResourceMetadata;
}

type UntypedWatchEventHandler = (e:UntypedWatchEvent) => Promise<void>;

interface WatchEventTask {
  event: UntypedWatchEvent;
  handler: UntypedWatchEventHandler;
}

/**
 * An active request to the k8s client watch api
 */
interface WatchRequest {
  abort: () => void;
}

/**
 * Base class for custom k8s controllers
 */
export abstract class Controller {
  protected readonly k8sApi: k8s.CoreV1Api;

  private readonly watchInstance: k8s.Watch;
  private readonly watchRequests: Record<string, WatchRequest> = {};
  private readonly resourceApiUriBuilders: Record<ResourceMetadataId, (metadata: ResourceMetadata) => string> = {};
  private readonly watchEventQueue: Async.QueueObject<WatchEventTask>;

  private started: boolean;
  private doneCallback: ((err: any) => void) | undefined;

  constructor(readonly kubeConfig: k8s.KubeConfig) {
    this.k8sApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
    this.watchInstance = new k8s.Watch(kubeConfig);
    this.watchEventQueue = Async.queue(async (task: WatchEventTask) => task.handler(task.event));
    this.started = false;
  }

  /**
   * Start the controller
   */
  public start = async (done: (err:any) => void): Promise<void> => {
    if (!this.started) {
      this.started = true;
      this.doneCallback = done;
      await this.init();
    }
  }

  /**
   * Stop the controller. Any active watch requests will be aborted.
   */
  public stop = (): void => Object.values(this.watchRequests).forEach(req => req.abort());

  /**
   * Initialise the controller. Register any resource watchers here.
   */
  protected abstract init(): Promise<void>;

  protected watchV1Namespaces = async (handler: WatchEventHandler<k8s.V1Namespace>): Promise<void> =>
    this.watch(new WatchSpec('', 'v1', 'namespaces'), handler);

  protected watchV1Pods = async (handler: WatchEventHandler<k8s.V1Pod>, namespace?: string): Promise<void> =>
    this.watch(new WatchSpec('', 'v1', 'pods', namespace ?? ''), handler);

  protected watchV1Beta1ServiceEntries = async (handler: WatchEventHandler<k8s.KubernetesObjectWithSpec>, namespace?: string): Promise<void> =>
    this.watch(new WatchSpec('networking.istio.io', 'v1beta1', 'serviceentries', namespace ?? ''), handler);

  /**
   * Convert an instance method to a WatchEventHandler. Makes it easier to create simple controllers whose
   * watch event handlers are just class instance methods, rather than creating dedicated WatchEventHandler
   * types.
   */
  protected watchEventHandlerFromMethod = <T extends k8s.KubernetesObject>(fn: (e: WatchEvent<T>) => Promise<void>): WatchEventHandler<T> => 
    ({ onWatchEvent: fn.bind(this) });
  
  /**
   * Returns the fully qualied k8s API uri for a resource
   */
  protected resourceApiUrl = (metadata: ResourceMetadata): string => {
    const fn = this.resourceApiUriBuilders[metadata.id];

    if (fn === undefined) {
      throw Error(`No resource api uri builder function is registered for ${metadata.id}`);
    }

    return fn(metadata);
  }

  /**
   * Returns the fully qualified k8s uri for a status subresource
   */
  protected statusUrl = (metadata: ResourceMetadata): string => `${this.resourceApiUrl(metadata)}/status`;

  protected watch = async <T extends k8s.KubernetesObject>(watchSpec: WatchSpec, handler: WatchEventHandler<T>): Promise<void> => {

    // Create a callback function that will run whenever our watch triggers. The callback will enque the untyped
    // watch event, and a wrapped version of the handler func that will co-erce the untyped event into the desired
    // type.
    const callback = (phase: string, apiObj: k8s.KubernetesObject, watchObj?: any): void => {
      this.watchEventQueue.push({
        event: {
          phase: phase as WatchEventPhase,
          resource: apiObj,
          meta: ResourceMetadata.fromId(watchSpec.id, apiObj)
        },
        handler: async ({phase, resource, meta}): Promise<void> => {
          return handler.onWatchEvent({
            phase,
            meta,
            resource: resource as T
          })
        }        
      });
    }

    // Done function is called if the watch terminates normally. If the watch terminated because of an error, err will be
    // set. If err is set we bail, otherwise we restart the watch.
    const done = (err: any):void => {
      if (err) {
        console.log(`watch on ${watchSpec.uri} failed: ${JSON.stringify(err)}`);

        if (this.doneCallback !== undefined) {
          this.doneCallback(err);
        } else {
          process.exit(1);
        }
      } else {
        console.log(`restarting watch on ${watchSpec.uri}`);
        setTimeout(start, 200);
      }
    }

    // We need to wrap the watch in a start func, so that it can be restarted by calling the start func again.
    const start = async (): Promise<any> => {
      try {
        const req = await this.watchInstance.watch(watchSpec.uri, {}, callback, done);
        this.watchRequests[watchSpec.uri] = req;
      } catch (err: any) {
        console.log(`watch on ${watchSpec.uri} failed: ${JSON.stringify(err)}`);
      }
    }
   
    // Set up a resource api uri builder func for any handlers of the watch events to use when they
    // need to work out the k8s api url from the metadata associated with a watched resource.
    this.resourceApiUriBuilders[watchSpec.id] = (metadata: ResourceMetadata): string => {
      return `${this.k8sApi.basePath}${ResourceMetadata.apiUri(watchSpec.group, watchSpec.version, watchSpec.plural, metadata.namespace)}/${metadata.name}`;
    }

    await start();
  }

  protected putResourceStatus = async (meta: ResourceMetadata, status: any): Promise<Response> => 
    this.resourceStatusRequest('PUT', meta, status);

  protected patchResourceStatus = async (meta: ResourceMetadata, status: any): Promise<Response> =>
    this.resourceStatusRequest('PATCH', meta, status);

  private resourceStatusRequest = async (method: 'PUT' | 'PATCH', meta: ResourceMetadata, status: unknown): Promise<Response> => {
    const body: any = {
      apiVersion: meta.apiVersion,
      kind: meta.kind,
      metadata: {
        name: meta.name,
        resourceVersion: meta.resourceVersion
      },
      status
    }
    
    if (meta.namespace) {
      body.metadata.namespace = meta.namespace
    }

    const url: URL = new URL(`${this.resourceApiUrl(meta)}/status`);

    const res = method === 'PATCH'
      ? await this.patch(url, body)
      : await this.put(url, body);

    if (res.statusCode && (res.statusCode < 200 || res.statusCode > 399)) {
      throw res;
    }
    
    return res;
  }

  private patch = async (url: URL, data: any): Promise<Response> => {
    const options: https.RequestOptions = {
      host: url.hostname,
      path: url.pathname,
      port: url.port,
      protocol: url.protocol,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/merge-patch+json'
      }
    }

    return this.request(options, data);
  }
  
  private put = async (url: URL, data: any): Promise<Response> => {
    const options: https.RequestOptions = {
      host: url.hostname,
      path: url.pathname,
      port: url.port,
      protocol: url.protocol,
      method: 'PUT',
    }

    return this.request(options, data);
  }

  private request = async (options: https.RequestOptions, data?:any | undefined): Promise<Response> => {
    await this.kubeConfig.applyToHTTPSOptions(options);

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res: IncomingMessage) => {
        const chunks: Array<any> = [];

        res.on("data", chunk => {
          chunks.push(chunk);
        });

        res.on("end", () => {
          try {
            resolve({
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              body:JSON.parse(Buffer.concat(chunks).toString())
            });
          } catch (err) {
            reject(err);
          }
        });
        
      });

      req.on("error", e => {
        reject(e);
      })

      if (data !== undefined) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }
}
