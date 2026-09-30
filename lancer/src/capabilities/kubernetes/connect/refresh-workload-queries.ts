import type { QueryClient } from "@tanstack/react-query";
import type { DeploymentSummary } from "@/entities/deployment/types";
import {
  deploymentKeys,
  eventKeys,
  podKeys,
} from "@/capabilities/kubernetes/connect/query-keys";
import { markWorkloadHot } from "@/capabilities/kubernetes/connect/workload-refresh-pace";

/** Immediately paint 上次重启 — don't wait for list round-trip. */
export function patchDeploymentRestartedAt(
  queryClient: QueryClient,
  clusterId: string,
  namespace: string,
  name: string,
  restartedAt: string,
): void {
  queryClient.setQueryData<DeploymentSummary[]>(
    deploymentKeys.list(clusterId, namespace),
    (old) =>
      old?.map((d) => (d.name === name ? { ...d, restartedAt } : d)) ?? old,
  );
}

/** Force active Pod/Deployment/Event lists to refetch now (restart / scale). */
export async function refreshWorkloadQueries(
  queryClient: QueryClient,
  clusterId: string,
  namespace: string,
): Promise<void> {
  markWorkloadHot();
  await Promise.all([
    queryClient.refetchQueries({ queryKey: deploymentKeys.list(clusterId, namespace) }),
    queryClient.refetchQueries({ queryKey: podKeys.list(clusterId, namespace) }),
    queryClient.refetchQueries({ queryKey: eventKeys.list(clusterId, namespace) }),
  ]);
}
