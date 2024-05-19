import * as k8s from '@kubernetes/client-node';

// Identifies resource group in <plural>.<group>/<apiVersion> format
export type ResourceMetadataId = string;

export type ApiVersion = string;

export class ResourceMetadata {
  readonly id: ResourceMetadataId;
  readonly name: string;
  readonly namespace?: string;
  readonly resourceVersion: string;
  readonly apiVersion: string;
  readonly kind: string;

  public static generateId(plural: string, apiVersion:string): ResourceMetadataId {
    return `${plural}.${apiVersion}` as ResourceMetadataId;
  }

  public static fromId(id: ResourceMetadataId, resource: k8s.KubernetesObject): ResourceMetadata {
    return new ResourceMetadata(id, resource);
  }

  public static fromPlural(plural: string, resource: k8s.KubernetesObject): ResourceMetadata {
    return new ResourceMetadata(ResourceMetadata.generateId(plural, resource.apiVersion!), resource);
  }

  public static apiVersion(group: string, version: string): string {
    return group ? `${group}/${version}` : `${version}`;
  }

  public static apiUri(group: string, version: string, plural: string, namespace?: string): string {
    let uri = `${ResourceMetadata.apiPath(group)}/${ResourceMetadata.apiVersion(group, version)}`
    uri = namespace ? `${uri}/namespaces/${namespace}` : uri;
    return `${uri}/${plural}`;
  }

  private static apiPath(group: string): string{
    return group ? `/apis` : `/api`;
  }

  private constructor(id: ResourceMetadataId, resource: k8s.KubernetesObject) {
    if (!resource.metadata?.name || !resource.metadata?.resourceVersion || !resource.apiVersion || !resource.kind) {
      throw Error(`Invalid k8s resource for ${id}`)

    }

    this.id = id;
    this.name = resource.metadata.name
    this.namespace = resource.metadata.namespace;
    this.resourceVersion = resource.metadata.resourceVersion;
    this.apiVersion = resource.apiVersion;
    this.kind = resource.kind;
  }
}
