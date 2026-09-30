import type { DeploymentSummary } from "@/entities/deployment/types";
import type { PodSummary } from "@/entities/pod/types";
import type { ServiceSummary } from "@/entities/service/types";
import type { ResourceListKind } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import {
  pickPreferredPod,
  podMatchesSelector,
} from "@/capabilities/kubernetes/logs/resolve-backing-pods";

export type LogTargetKind = ResourceListKind;

/**
 * Resolve which Pods can stream logs for the current selection.
 * Pod → itself; Service/Deployment → selector / matchLabels.
 */
export function resolveLogTarget(input: {
  kind: LogTargetKind;
  selectedId: string | null;
  pods: PodSummary[];
  deployments: DeploymentSummary[];
  services: ServiceSummary[];
}): { resourceName: string | null; pods: PodSummary[]; preferred: PodSummary | null } {
  const { kind, selectedId, pods, deployments, services } = input;
  if (selectedId === null) {
    return { resourceName: null, pods: [], preferred: null };
  }

  if (kind === "pod") {
    const pod = pods.find((p) => p.uid === selectedId) ?? null;
    return {
      resourceName: pod?.name ?? null,
      pods: pod ? [pod] : [],
      preferred: pod,
    };
  }

  if (kind === "deployment") {
    const deployment = deployments.find((d) => d.uid === selectedId) ?? null;
    if (!deployment) {
      return { resourceName: null, pods: [], preferred: null };
    }
    const matched = pods.filter((p) => podMatchesSelector(p, deployment.matchLabels));
    return {
      resourceName: deployment.name,
      pods: matched,
      preferred: pickPreferredPod(matched),
    };
  }

  const service = services.find((s) => s.uid === selectedId) ?? null;
  if (!service) {
    return { resourceName: null, pods: [], preferred: null };
  }
  const matched = pods.filter((p) => podMatchesSelector(p, service.selector));
  return {
    resourceName: service.name,
    pods: matched,
    preferred: pickPreferredPod(matched),
  };
}
