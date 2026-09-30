export type ResourceWatchKind = "pod" | "deployment" | "service" | "event";

export type ResourceWatchAction = "upsert" | "delete" | "resyncStart" | "resyncDone";

/** @deprecated use ResourceWatchEvent — kept for older listeners */
export interface ResourceChangedEvent {
  clusterId: string;
  namespace: string;
  kind: ResourceWatchKind;
}

/** Rancher-style watch delta from Rust (object already mapped to summary DTO). */
export interface ResourceWatchEvent {
  clusterId: string;
  namespace: string;
  kind: ResourceWatchKind;
  action: ResourceWatchAction;
  pod?: PodWatchDto;
  deployment?: DeploymentWatchDto;
  service?: ServiceWatchDto;
  event?: EventWatchDto;
}

export interface PodWatchDto {
  uid: string;
  name: string;
  namespace: string;
  phase: string;
  ready: string;
  restarts: number;
  nodeName: string;
  podIp?: string;
  image?: string;
  createdAt: string;
  labels?: Record<string, string>;
  containers?: string[];
}

export interface DeploymentWatchDto {
  uid: string;
  name: string;
  namespace: string;
  ready: string;
  replicas: number;
  upToDate: number;
  available: number;
  image: string;
  createdAt: string;
  restartedAt?: string;
  matchLabels?: Record<string, string>;
}

export interface ServiceWatchDto {
  uid: string;
  name: string;
  namespace: string;
  serviceType: string;
  clusterIp: string;
  ports: string;
  createdAt: string;
  selector?: Record<string, string>;
}

export interface EventWatchDto {
  uid: string;
  name: string;
  namespace: string;
  eventType: string;
  reason: string;
  message: string;
  count: number;
  involvedKind: string;
  involvedName: string;
  source: string;
  firstTimestamp: string;
  lastTimestamp: string;
}

export const K8S_RESOURCE_CHANGED_EVENT = "k8s-resource-changed";
