import type { QueryClient } from "@tanstack/react-query";
import type { ResourceWatchKind } from "@/entities/watch/types";
import {
  deploymentKeys,
  eventKeys,
  podKeys,
  serviceKeys,
} from "@/capabilities/kubernetes/connect/query-keys";

/** Watch 事件后立刻 refetch 活跃列表（比 invalidate 更直接）。 */
export function invalidateResourceQuery(
  queryClient: QueryClient,
  clusterId: string,
  namespace: string,
  kind: ResourceWatchKind,
): void {
  switch (kind) {
    case "pod":
      void queryClient.refetchQueries({ queryKey: podKeys.list(clusterId, namespace) });
      break;
    case "deployment":
      void queryClient.refetchQueries({
        queryKey: deploymentKeys.list(clusterId, namespace),
      });
      break;
    case "service":
      void queryClient.refetchQueries({ queryKey: serviceKeys.list(clusterId, namespace) });
      break;
    case "event":
      void queryClient.refetchQueries({ queryKey: eventKeys.list(clusterId, namespace) });
      break;
  }
}
