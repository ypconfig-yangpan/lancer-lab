import { describe, expect, it } from "vitest";
import type { DeploymentSummary } from "@/entities/deployment/types";
import type { PodSummary } from "@/entities/pod/types";
import type { ServiceSummary } from "@/entities/service/types";
import { resolveLogTarget } from "./resolve-log-target";

const pods: PodSummary[] = [
  {
    uid: "p1",
    name: "api-1",
    namespace: "default",
    phase: "Running",
    ready: "1/1",
    restarts: 0,
    nodeName: "n1",
    podIp: "10.244.0.1",
    image: "app:latest",
    ageSeconds: 0,
    createdAt: "2026-01-01T00:00:00Z",
    labels: { app: "api" },
    containers: ["api"],
  },
  {
    uid: "p2",
    name: "api-2",
    namespace: "default",
    phase: "Pending",
    ready: "0/1",
    restarts: 0,
    nodeName: "n1",
    podIp: "10.244.0.1",
    image: "app:latest",
    ageSeconds: 0,
    createdAt: "2026-01-01T00:00:00Z",
    labels: { app: "api" },
    containers: ["api", "sidecar"],
  },
  {
    uid: "p3",
    name: "other",
    namespace: "default",
    phase: "Running",
    ready: "1/1",
    restarts: 0,
    nodeName: "n1",
    podIp: "10.244.0.1",
    image: "app:latest",
    ageSeconds: 0,
    createdAt: "2026-01-01T00:00:00Z",
    labels: { app: "other" },
    containers: ["main"],
  },
];

const deployments: DeploymentSummary[] = [
  {
    uid: "d1",
    name: "api",
    namespace: "default",
    ready: "1/2",
    replicas: 2,
    upToDate: 2,
    available: 1,
    image: "api:1",
    restartedAt: "",
    createdAt: "2026-01-01T00:00:00Z",
    matchLabels: { app: "api" },
  },
];

const services: ServiceSummary[] = [
  {
    uid: "s1",
    name: "api-svc",
    namespace: "default",
    serviceType: "ClusterIP",
    clusterIp: "10.0.0.1",
    ports: "80/TCP",
    createdAt: "2026-01-01T00:00:00Z",
    selector: { app: "api" },
  },
];

describe("resolveLogTarget", () => {
  it("returns the selected pod", () => {
    const result = resolveLogTarget({
      kind: "pod",
      selectedId: "p1",
      pods,
      deployments,
      services,
    });
    expect(result.preferred?.name).toBe("api-1");
    expect(result.pods).toHaveLength(1);
  });

  it("resolves service backing pods preferring Running", () => {
    const result = resolveLogTarget({
      kind: "service",
      selectedId: "s1",
      pods,
      deployments,
      services,
    });
    expect(result.pods.map((p) => p.name)).toEqual(["api-1", "api-2"]);
    expect(result.preferred?.name).toBe("api-1");
  });

  it("resolves deployment matchLabels", () => {
    const result = resolveLogTarget({
      kind: "deployment",
      selectedId: "d1",
      pods,
      deployments,
      services,
    });
    expect(result.pods).toHaveLength(2);
    expect(result.resourceName).toBe("api");
  });
});
