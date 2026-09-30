import { useEffect } from "react";
import { kubernetesApi } from "@/capabilities/kubernetes/api";
import type { ResourceWatchKind } from "@/entities/watch/types";

/** Start/stop a deduplicated Rust watch for cluster+namespace+kind while mounted. */
export function useResourceWatch(
  clusterId: string | null,
  namespace: string,
  kind: ResourceWatchKind,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled || clusterId === null || namespace.trim().length === 0) {
      return;
    }

    const input = { clusterId, namespace, kind };
    void kubernetesApi.startWatch(input);

    return () => {
      void kubernetesApi.stopWatch(input);
    };
  }, [enabled, clusterId, namespace, kind]);
}
