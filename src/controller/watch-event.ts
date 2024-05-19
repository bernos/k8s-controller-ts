import { KubernetesObject } from '@kubernetes/client-node';
import { ResourceMetadata, ResourceMetadataId } from './resource-metadata'; 

export enum WatchEventPhase {
  Added = 'ADDED',
  Deleted = 'DELETED',
  Modified = 'MODIFIED'
}

export interface WatchEvent<T extends KubernetesObject> {
  phase: WatchEventPhase;
  resource: T;
  meta: ResourceMetadata;
}

/**
 * Handles a k8s resource WatchEvent
 */
export interface WatchEventHandler<T extends KubernetesObject> {
  onWatchEvent: (e: WatchEvent<T>) => Promise<void>;
}

/**
 * Specifies a type of k8s resource to watch, optionally scoped to a single namespace
 */
export class WatchSpec {

  readonly id: ResourceMetadataId;
  readonly uri: string;

  constructor(readonly group: string, readonly version: string, readonly plural: string, readonly namespace?: string) {
    this.id = ResourceMetadata.generateId(plural, ResourceMetadata.apiVersion(group, version));
    this.uri = ResourceMetadata.apiUri(group, version, plural, namespace);
  }
}
