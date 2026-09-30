import type { PodSummary } from "@/entities/pod/types";

/** Match pod labels against a selector map (all keys must equal). */
export function podMatchesSelector(
  pod: PodSummary,
  selector: Record<string, string>,
): boolean {
  const entries = Object.entries(selector);
  if (entries.length === 0) {
    return false;
  }
  return entries.every(([key, value]) => pod.labels[key] === value);
}

/** Prefer Running pods (skip Terminating), then first match. */
export function pickPreferredPod(pods: PodSummary[]): PodSummary | null {
  if (pods.length === 0) {
    return null;
  }
  return (
    pods.find((p) => p.phase === "Running") ??
    pods.find((p) => p.phase !== "Terminating") ??
    pods[0] ??
    null
  );
}

/**
 * During rolling restart there are ≥2 pods: mark ones from the latest restart
 * (createdAt ≥ restartedAt), else the newest by createdAt.
 */
export function isRolloutNewPod(
  pod: Pick<PodSummary, "createdAt">,
  peers: readonly Pick<PodSummary, "createdAt">[],
  restartedAt?: string,
): boolean {
  if (peers.length < 2) {
    return false;
  }
  const podMs = Date.parse(pod.createdAt);
  if (!Number.isFinite(podMs)) {
    return false;
  }
  if (restartedAt) {
    const restartMs = Date.parse(restartedAt);
    if (Number.isFinite(restartMs)) {
      // 2s skew: annotation time vs pod create time
      return podMs >= restartMs - 2_000;
    }
  }
  let newest = Number.NEGATIVE_INFINITY;
  for (const peer of peers) {
    const t = Date.parse(peer.createdAt);
    if (Number.isFinite(t) && t > newest) {
      newest = t;
    }
  }
  return podMs === newest;
}
