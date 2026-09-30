import type { PodSummary } from "@/entities/pod/types";

/** Catalog demo when no cluster is connected — visual only. */
export const K8S_DEMO_TREE = {
  cluster: "test-cluster",
  namespaces: ["billing-prod", "default", "kube-system"],
  workloads: ["Pods", "Deployments", "Services"] as const,
};

export const K8S_DEMO_PODS: PodSummary[] = [
  {
    uid: "demo-pod-1",
    name: "billing-api",
    namespace: "billing-prod",
    phase: "Running",
    ready: "1/1",
    restarts: 0,
    nodeName: "node-a",
    podIp: "10.244.0.1",
    image: "app:latest",
    ageSeconds: 180_000,
    createdAt: "2026-09-01T02:00:00.000Z",
    labels: { app: "billing-api" },
    containers: ["api"],
  },
  {
    uid: "demo-pod-2",
    name: "billing-worker",
    namespace: "billing-prod",
    phase: "Running",
    ready: "1/1",
    restarts: 1,
    nodeName: "node-b",
    podIp: "10.244.0.1",
    image: "app:latest",
    ageSeconds: 176_400,
    createdAt: "2026-09-01T03:00:00.000Z",
    labels: { app: "billing-worker" },
    containers: ["worker"],
  },
  {
    uid: "demo-pod-3",
    name: "billing-api-canary",
    namespace: "billing-prod",
    phase: "Pending",
    ready: "0/1",
    restarts: 0,
    nodeName: "node-a",
    podIp: "10.244.0.1",
    image: "app:latest",
    ageSeconds: 3_600,
    createdAt: "2026-09-03T06:00:00.000Z",
    labels: { app: "billing-api", track: "canary" },
    containers: ["api"],
  },
];

export function k8sDemoPodsForNamespace(namespace: string): PodSummary[] {
  if (namespace.length === 0 || namespace === "default") {
    return K8S_DEMO_PODS;
  }
  return K8S_DEMO_PODS.filter((p) => p.namespace === namespace);
}
