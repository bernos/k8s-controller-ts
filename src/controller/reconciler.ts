import { CoreV1Api, KubeConfig, KubernetesObject } from "@kubernetes/client-node";
import { ResourceMetadata } from "./resource-metadata";
import { WatchEvent, WatchEventHandler, WatchEventPhase, WatchEventTaskQueue, WatchSpec } from "./watch-event";

export interface ReconcileRequest<T extends KubernetesObject> {
  // The WatchEventPhase of the WatchEvent that triggered the ReconcileRequest
  phase: WatchEventPhase;

  // The KubernetesObject to be reconciled
  resource: T;

  // ResourceMetadata for the KubernetesObject to be reconciled
  meta: ResourceMetadata;

  // The WatchSpec that the WatchEvent that triggered the ReconcileRequest matched on
  watchSpec: WatchSpec;
}

/**
 * A Reconciler handles ReconcileRequests
 */
export interface Reconciler<T extends KubernetesObject> {
  reconcile: (req: ReconcileRequest<T>) => Promise<void>;
}

/**
 * AbstractReconciler should be used as the base class for most Reconciler classes
 *
 * It includes useful utility methods for managing status of the KubernetesObjects
 * that extending classes manage.
 */
export abstract class AbstractReconciler<T extends KubernetesObject> {
  
  protected readonly k8sApi: CoreV1Api;

  constructor(readonly kubeConfig: KubeConfig) {
    this.k8sApi = kubeConfig.makeApiClient(CoreV1Api);
  }

  public abstract reconcile(req: ReconcileRequest<T>): Promise<void>;

  /**
   * Returns the fully qualied k8s API uri for a resource
   */
  protected resourceApiUrl(req: ReconcileRequest<T>): string {
    const resourcePath = ResourceMetadata.apiUri(req.watchSpec.group, req.watchSpec.version, req.watchSpec.plural, req.meta.namespace);
    
    return `${this.k8sApi.basePath}${resourcePath}/${req.meta.name}`
  }

  /**
   * Returns the fully qualified k8s uri for a status subresource
   */
  protected statusUrl(req: ReconcileRequest<T>): string {
    return `${this.resourceApiUrl(req)}/status`;
  }
}

/**
 * ReconcileRequestDispatcher is responsible for queuing up ReconcileRequests
 * from incoming WatchEvents. 
 */
export class ReconcileRequestDispatcher<T extends KubernetesObject> {
  public constructor(
    readonly reconciler:Reconciler<T>, 
    readonly queue:WatchEventTaskQueue,
    readonly watchSpec:WatchSpec) {}

  public dispatch(event:WatchEvent): void {
    const handler: WatchEventHandler = async({phase, resource, meta}): Promise<void> =>
      this.reconciler.reconcile({
        phase,
        meta,
        resource: resource as T,
        watchSpec: this.watchSpec
      });

    this.queue.enqueue(event, handler)
  }
}
