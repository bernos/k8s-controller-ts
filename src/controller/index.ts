export * from './controller'
export * from './watch-event'

// import * as k8s from '@kubernetes/client-node';
// import * as Async from 'async';
// import { RequestOptions, Agent } from 'https';
// import fetch, { Headers, RequestInfo, RequestInit, Response } from 'node-fetch'

// export class ResourceMetadata {
//   readonly id: string;
//   readonly name: string;
//   readonly namespace?: string;
//   readonly resourceVersion: string;
//   readonly apiVersion: string;
//   readonly kind: string;

//   public static fromId(id: string, resource: k8s.KubernetesObject): ResourceMetadata {
//     return new ResourceMetadata(id, resource);
//   }

//   public static fromPlural(plural: string, resource: k8s.KubernetesObject): ResourceMetadata {
//     return new ResourceMetadata(`${plural}.${resource.apiVersion}`, resource);
//   }

//   private constructor(id: string, resource: k8s.KubernetesObject) {
//     if (!resource.metadata?.name || !resource.metadata?.resourceVersion || !resource.apiVersion || !resource.kind) {
//       throw Error(`Invalid k8s resource for ${id}`)

//     }

//     this.id = id;
//     this.name = resource.metadata.name
//     this.namespace = resource.metadata.namespace;
//     this.resourceVersion = resource.metadata.resourceVersion;
//     this.apiVersion = resource.apiVersion;
//     this.kind = resource.kind;
//   }
// }

// export enum WatchEventPhase {
//   Added = 'ADDED',
//   Deleted = 'DELETED',
//   Modified = 'MODIFIED'
// }


// export interface WatchEvent<T> {
//   phase: WatchEventPhase;
//   resource: T;
//   meta: ResourceMetadata;
// }

// /**
//  * Handles a k8s resource WatchEvent
//  */
// interface WatchEventHandler<T> {
//   onWatchEvent: (e: WatchEvent<T>) => Promise<void>;
// }




// /**
//  * Base class for custom k8s controllers
//  */
// export abstract class Controller {
//   protected readonly kubeConfig: k8s.KubeConfig;
//   protected readonly k8sApi: k8s.CoreV1Api;
//   private readonly watchRequests: Record<string, WatchRequest> = {};
//   private readonly resourceApiUriBuilders: Record<string, (metadata: ResourceMetadata) => string> = {};
//   private readonly watchEventQueue: Async.QueueObject<{ event: UntypedWatchEvent, handler: (e:UntypedWatchEvent) => Promise<void> }>;
  

//   constructor(kubeConfig: k8s.KubeConfig) {
//     this.kubeConfig = kubeConfig;
//     this.k8sApi = kubeConfig.makeApiClient(k8s.CoreV1Api);
//     this.watchEventQueue = Async.queue(async (args) => args.handler(args.event));
//   }

//   /**
//    * Start the controller
//    */
//   public async start(): Promise<void> {
//     return await this.init();
//   }

//   /**
//    * Stop the controller. Any active watch requests will be aborted.
//    */
//   public stop(): void {
//     Object.values(this.watchRequests).forEach(req => req.abort());
//   }

//   /**
//    * Initialise the controller. Register any resource watchers here.
//    */
//   protected abstract init(): Promise<void>;

//   protected async watchV1Namespaces(handler: WatchEventHandler<k8s.V1Namespace>): Promise<void> {
//     this.watch(new WatchSpec('', 'v1', 'namespaces'), handler);
//   }

//   protected async watchV1Pods(handler: WatchEventHandler<k8s.V1Pod>, namespace?: string): Promise<void> {
//     this.watch(new WatchSpec('', 'v1', 'pods', namespace ?? ''), handler);
//   }

//   protected async watchV1Beta1ServiceEntries(handler: WatchEventHandler<k8s.KubernetesObjectWithSpec>, namespace?: string): Promise<void> {
//     this.watch(new WatchSpec('networking.istio.io', 'v1beta1', 'serviceentries', namespace ?? ''), handler);
//   }

//   /**
//    * Convert an instance method to a WatchEventHandler. Makes it easier to create simple controllers whose
//    * watch event handlers are just class instance methods, rather than creating dedicated WatchEventHandler
//    * types.
//    */
//   protected watchEventHandlerFromMethod<T>(fn: (e: WatchEvent<T>) => Promise<void>): WatchEventHandler<T> {
//     return { onWatchEvent: fn.bind(this) };
//   }

//   /**
//    * Returns the fully qualied k8s API uri for a resource
//    */
//   protected resourceApiUrl(metadata: ResourceMetadata): string {
//     const fn = this.resourceApiUriBuilders[metadata.id];

//     if (fn === undefined) {
//       throw Error(`No resource api uri builder function is registered for ${metadata.id}`);
//     }

//     return fn(metadata);
//   }

//   protected async watch<T>(watchSpec: WatchSpec, handler: WatchEventHandler<T>): Promise<void> {

//     const queryParams = {};
//     const watch = new k8s.Watch(this.kubeConfig);

//     this.resourceApiUriBuilders[watchSpec.id] = (metadata: ResourceMetadata): string => {
//       return `${this.k8sApi.basePath}${resourceApiUri(watchSpec.group, watchSpec.version, watchSpec.plural, metadata.namespace)}/${metadata.name}`;
//     }

//     const start = (): Promise<void> =>
//       watch.watch(watchSpec.uri, queryParams,
//         (phase: string, apiObj: k8s.KubernetesObject, watchObj?: any): void => {
//           this.watchEventQueue.push({
//             event: {
//               phase: phase as WatchEventPhase,
//               resource: apiObj,
//               meta: ResourceMetadata.fromId(watchSpec.id, apiObj)
//             },
//             handler: async ({phase, resource, meta}): Promise<void> => {
//               return handler.onWatchEvent({
//                 phase,
//                 meta,
//                 resource: resource as T
//               })
//             }
//           });
//         },

//         (err) => {
//           if (err) {
//             console.log(`watch on ${watchSpec.uri} failed: ${JSON.stringify(err)}`);
//             process.exit(1);
//           }
//           console.log(`restarting watch on ${watchSpec.uri}`);
//           setTimeout(start, 200);
//         }).catch((reason) => {
//           console.log(`watch on ${watchSpec.uri} failed: ${JSON.stringify(reason)}`);
//         }).then((watchRequest) => {
//           this.watchRequests[watchSpec.uri] = watchRequest;
//         });

//     await start();
//   }

//   public async fetch(url: RequestInfo, init?: RequestInit | undefined): Promise<Response> {

//     const opts: RequestOptions = {};
//     const fetchInit: RequestInit = init ?? {};
   
//     fetchInit.headers = new Headers(init?.headers);

//     await this.kubeConfig.applyToHTTPSOptions(opts);
    
//     if (opts.headers?.Authorization) {
//       fetchInit.headers.append('Authorization', opts.headers.authorization as string)
//     }

//     if (opts.ca || opts.cert || opts.key) {
//       fetchInit.agent = new Agent({
//         ca: opts.ca,
//         cert: opts.cert,
//         key: opts.key,
//       });
//     }

//     return fetch.default(url, fetchInit);
//   }




  
// }
