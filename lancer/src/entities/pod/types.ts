export type PodPhase =
  | "Pending"
  | "Running"
  | "Succeeded"
  | "Failed"
  | "Unknown"
  | "Terminated"
  | "Terminating";

export interface PodSummary {
  uid: string;
  name: string;
  namespace: string;
  phase: PodPhase;
  ready: string;
  restarts: number;
  nodeName: string;
  /** Pod IP when assigned. */
  podIp: string;
  /** Primary container image. */
  image: string;
  ageSeconds: number;
  createdAt: string;
  labels: Record<string, string>;
  containers: string[];
}
