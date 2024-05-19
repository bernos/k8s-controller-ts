import { KubernetesObject } from '@kubernetes/client-node';
import { ResourceMetadata, ResourceMetadataId } from './resource-metadata'; 
import * as Async from 'async';

export interface WatchEvent {
  phase: WatchEventPhase;
  resource: KubernetesObject;
  meta: ResourceMetadata;
}

export type WatchEventHandler = (e:WatchEvent) => Promise<void>;

export enum WatchEventPhase {
  Added = 'ADDED',
  Deleted = 'DELETED',
  Modified = 'MODIFIED'
}


/**
 * Specifies a type of k8s resource to watch, optionally scoped to a single namespace
 */
export class WatchSpec {

  readonly id: ResourceMetadataId;
  readonly uri: string;

  public static forV1Namespaces = () => 
    new WatchSpec('', 'v1', 'namespaces');

  public static forV1Pods = (namespace?: string): WatchSpec => 
    new WatchSpec('', 'v1', 'pods', namespace ?? '');

  constructor(readonly group: string, readonly version: string, readonly plural: string, readonly namespace?: string) {
    this.id = ResourceMetadata.generateId(plural, ResourceMetadata.apiVersion(group, version));
    this.uri = ResourceMetadata.apiUri(group, version, plural, namespace);
  }
}

interface WatchEventTask {
  event: WatchEvent;
  handler: WatchEventHandler;
}

export class WatchEventTaskQueue {
  private readonly queue: Async.QueueObject<WatchEventTask>;

  public constructor() {
    this.queue = Async.queue(this.handleTask)
  }

  public enqueue(event: WatchEvent, handler: WatchEventHandler): void {
    this.queue.push({ event, handler })
  }

  private async handleTask(task: WatchEventTask): Promise<void> {
    return task.handler(task.event);
  }
}



