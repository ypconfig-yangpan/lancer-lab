/**
 * After restart/scale, poll faster for a while so Ready/Age catch up
 * even before the next Watch event round-trip finishes.
 */
let hotUntilMs = 0;
const listeners = new Set<() => void>();

export function markWorkloadHot(durationMs = 45_000): void {
  hotUntilMs = Math.max(hotUntilMs, Date.now() + durationMs);
  for (const listener of listeners) {
    listener();
  }
}

export function isWorkloadHot(now = Date.now()): boolean {
  return now < hotUntilMs;
}

export function subscribeWorkloadHot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
