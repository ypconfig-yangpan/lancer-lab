/** Centralized application lifecycle timeouts (ms). No magic numbers in LancerApp. */
export const APP_LIFECYCLE_TIMEOUTS = {
  subsystemStart: 15_000,
  subsystemStop: 10_000,
  beforeShutdownHook: 5_000,
} as const;

export type AppLifecycleTimeoutKey = keyof typeof APP_LIFECYCLE_TIMEOUTS;
