import { describe, expect, it, vi } from "vitest";
import { kubernetesApi } from "./client";

vi.mock("@/native/kubernetes", () => ({
  createDefaultKubernetesNativeApi: () => ({
    listPods: vi.fn(async () => [
      {
        uid: "1",
        name: "nginx",
        namespace: "default",
        phase: "Running",
        ready: "1/1",
        restarts: 0,
        nodeName: "n1",
        ageSeconds: 0,
        createdAt: "2026-01-01T00:00:00Z",
        labels: { app: "nginx" },
        containers: ["nginx"],
      },
    ]),
    listContexts: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    listConnected: vi.fn(),
    listNamespaces: vi.fn(),
    listDeployments: vi.fn(),
    listServices: vi.fn(),
    listEvents: vi.fn(),
    getYaml: vi.fn(),
    startWatch: vi.fn(),
    stopWatch: vi.fn(),
    scaleDeployment: vi.fn(),
    restartDeployment: vi.fn(),
  }),
}));

vi.mock("@/native/logs", () => ({
  createDefaultLogsNativeApi: () => ({
    open: vi.fn(),
    close: vi.fn(),
    readWindow: vi.fn(),
    getSession: vi.fn(),
    setPaused: vi.fn(),
  }),
}));

describe("kubernetesApi", () => {
  it("lists pods via native without plugin.apply", async () => {
    const pods = await kubernetesApi.listPods("c1", "default");
    expect(pods[0]?.name).toBe("nginx");
  });
});
