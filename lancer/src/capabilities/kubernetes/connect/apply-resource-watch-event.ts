import type { QueryClient } from "@tanstack/react-query";
import type { DeploymentSummary } from "@/entities/deployment/types";
import type { EventSummary } from "@/entities/event/types";
import type { PodSummary } from "@/entities/pod/types";
import type { ServiceSummary } from "@/entities/service/types";
import type {
  DeploymentWatchDto,
  EventWatchDto,
  PodWatchDto,
  ResourceWatchEvent,
  ServiceWatchDto,
} from "@/entities/watch/types";
import {
  deploymentKeys,
  eventKeys,
  podKeys,
  serviceKeys,
} from "@/capabilities/kubernetes/connect/query-keys";
import { ageSecondsFrom } from "@/shared/lib/datetime";

type UidRow = { uid: string };

function upsertByUid<T extends UidRow>(list: T[], item: T): T[] {
  const idx = list.findIndex((row) => row.uid === item.uid);
  if (idx < 0) {
    return [...list, item];
  }
  const next = list.slice();
  next[idx] = item;
  return next;
}

function deleteByUid<T extends UidRow>(list: T[], uid: string): T[] {
  return list.filter((row) => row.uid !== uid);
}

function mapPod(dto: PodWatchDto): PodSummary {
  const phase = normalizePodPhase(dto.phase);
  return {
    uid: dto.uid,
    name: dto.name,
    namespace: dto.namespace,
    phase,
    ready: dto.ready,
    restarts: dto.restarts,
    nodeName: dto.nodeName,
    podIp: dto.podIp ?? "",
    image: dto.image ?? "",
    ageSeconds: ageSecondsFrom(dto.createdAt),
    createdAt: dto.createdAt,
    labels: dto.labels ?? {},
    containers: dto.containers ?? [],
  };
}

function normalizePodPhase(phase: string): PodSummary["phase"] {
  switch (phase) {
    case "Pending":
    case "Running":
    case "Succeeded":
    case "Failed":
    case "Unknown":
    case "Terminated":
    case "Terminating":
      return phase;
    default:
      return "Unknown";
  }
}

function mapDeployment(dto: DeploymentWatchDto): DeploymentSummary {
  return {
    uid: dto.uid,
    name: dto.name,
    namespace: dto.namespace,
    ready: dto.ready,
    replicas: dto.replicas,
    upToDate: dto.upToDate,
    available: dto.available,
    image: dto.image,
    createdAt: dto.createdAt,
    restartedAt: dto.restartedAt ?? "",
    matchLabels: dto.matchLabels ?? {},
  };
}

function mapService(dto: ServiceWatchDto): ServiceSummary {
  return {
    uid: dto.uid,
    name: dto.name,
    namespace: dto.namespace,
    serviceType: dto.serviceType,
    clusterIp: dto.clusterIp,
    ports: dto.ports,
    createdAt: dto.createdAt,
    selector: dto.selector ?? {},
  };
}

function mapEvent(dto: EventWatchDto): EventSummary {
  return {
    uid: dto.uid,
    name: dto.name,
    namespace: dto.namespace,
    eventType: dto.eventType,
    reason: dto.reason,
    message: dto.message,
    count: dto.count,
    involvedKind: dto.involvedKind,
    involvedName: dto.involvedName,
    source: dto.source,
    firstTimestamp: dto.firstTimestamp,
    lastTimestamp: dto.lastTimestamp,
  };
}

/** Per watch-key buffer while Rust sends Init → InitApply* → InitDone. */
const resyncBuffers = new Map<string, UidRow[]>();

function watchKey(ev: ResourceWatchEvent): string {
  return `${ev.clusterId}:${ev.namespace}:${ev.kind}`;
}

function listQueryKey(ev: ResourceWatchEvent): readonly unknown[] {
  switch (ev.kind) {
    case "pod":
      return podKeys.list(ev.clusterId, ev.namespace);
    case "deployment":
      return deploymentKeys.list(ev.clusterId, ev.namespace);
    case "service":
      return serviceKeys.list(ev.clusterId, ev.namespace);
    case "event":
      return eventKeys.list(ev.clusterId, ev.namespace);
  }
}

function mappedItem(ev: ResourceWatchEvent): UidRow | null {
  switch (ev.kind) {
    case "pod":
      return ev.pod ? mapPod(ev.pod) : null;
    case "deployment":
      return ev.deployment ? mapDeployment(ev.deployment) : null;
    case "service":
      return ev.service ? mapService(ev.service) : null;
    case "event":
      return ev.event ? mapEvent(ev.event) : null;
  }
}

/**
 * Apply one watch delta into TanStack Query list cache (no list API round-trip).
 */
export function applyResourceWatchEvent(
  queryClient: QueryClient,
  ev: ResourceWatchEvent,
): void {
  const key = watchKey(ev);
  const queryKey = listQueryKey(ev);

  if (ev.action === "resyncStart") {
    resyncBuffers.set(key, []);
    return;
  }

  if (ev.action === "resyncDone") {
    const buffer = resyncBuffers.get(key);
    resyncBuffers.delete(key);
    if (buffer) {
      queryClient.setQueryData(queryKey, buffer);
    }
    return;
  }

  const item = mappedItem(ev);
  if (!item) {
    return;
  }

  const buffer = resyncBuffers.get(key);
  if (buffer) {
    if (ev.action === "upsert") {
      resyncBuffers.set(key, upsertByUid(buffer, item));
    } else if (ev.action === "delete") {
      resyncBuffers.set(key, deleteByUid(buffer, item.uid));
    }
    return;
  }

  queryClient.setQueryData<UidRow[]>(queryKey, (prev) => {
    const list = prev ?? [];
    if (ev.action === "upsert") {
      return upsertByUid(list, item);
    }
    if (ev.action === "delete") {
      return deleteByUid(list, item.uid);
    }
    return list;
  });
}
