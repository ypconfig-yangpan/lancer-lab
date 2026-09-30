import { describe, expect, it } from "vitest";
import { createNativeApi } from "./index";

describe("createNativeApi", () => {
  it("diagnostics.health uses injected bridge (no Tauri command names for callers)", async () => {
    const api = createNativeApi({
      bridge: {
        health: async () => ({
          status: "ok",
          phase: "ready",
          kubernetesConnected: false,
          lastAbnormalExit: false,
          logDir: "/tmp/lancer",
        }),
      },
    });

    await expect(api.diagnostics.health()).resolves.toMatchObject({
      status: "ok",
      phase: "ready",
    });
  });

  it("process.exec is forbidden in V1", async () => {
    const api = createNativeApi({
      bridge: {
        health: async () => {
          throw new Error("unused");
        },
      },
    });

    await expect(api.process.exec({ command: "echo", args: ["hi"] })).rejects.toMatchObject({
      code: "NATIVE_FORBIDDEN",
    });
  });

  it("logs.open uses injected bridge (Disk default is Tauri; tests stay in-memory)", async () => {
    const { createInMemoryLogsNativeApi } = await import("./logs-engine");
    const api = createNativeApi({
      bridge: {
        health: async () => ({
          status: "ok",
          phase: "ready",
          kubernetesConnected: false,
          lastAbnormalExit: false,
          logDir: "/tmp",
        }),
        logs: createInMemoryLogsNativeApi({ defaultLineCount: 50 }),
      },
    });

    const session = await api.logs.open({ provider: "kubernetes", pod: "p1" });
    expect(session.sessionId.length).toBeGreaterThan(0);
    const window = await api.logs.readWindow({
      sessionId: session.sessionId,
      offset: 0,
      limit: 10,
    });
    expect(window.lines.length).toBe(10);
    await api.logs.close(session.sessionId);
  });

  it("wraps bridge failures as NATIVE_BRIDGE_FAILED", async () => {
    const api = createNativeApi({
      bridge: {
        health: async () => {
          throw new Error("tauri down");
        },
      },
    });

    await expect(api.diagnostics.health()).rejects.toMatchObject({
      code: "NATIVE_BRIDGE_FAILED",
      message: "tauri down",
    });
  });

  it("docker.ping uses injected bridge", async () => {
    const api = createNativeApi({
      bridge: {
        health: async () => ({
          status: "ok",
          phase: "ready",
          kubernetesConnected: false,
          lastAbnormalExit: false,
          logDir: "/tmp",
        }),
        docker: {
          async ping() {
            return { ok: true, apiVersion: "1.45" };
          },
          async listContainers() {
            return [
              {
                id: "abc123",
                name: "nginx",
                image: "nginx:alpine",
                status: "Running",
                ports: "80/tcp",
                cpu: "1.2%",
                memory: "32MB",
              },
            ];
          },
          async inspectContainer() {
            return {
              id: "abc123",
              name: "nginx",
              image: "nginx:alpine",
              imageId: "sha256:abc",
              status: "Running",
              health: "healthy",
              created: "2026-01-01T00:00:00Z",
              command: "nginx",
              restartPolicy: "no",
              network: "bridge",
              ipAddress: "172.17.0.2",
              ports: "80/tcp",
              mounts: "",
              labels: {},
              cpu: "1.2%",
              memory: "32MB",
            };
          },
          async containerLogs() {
            return [
              {
                id: "1",
                lineNumber: 1,
                timestamp: "2026-09-04T01:00:00Z",
                level: "INFO",
                message: "hello",
              },
            ];
          },
          async startContainer() {
            return { containerId: "abc123", action: "start" };
          },
          async stopContainer() {
            return { containerId: "abc123", action: "stop" };
          },
          async restartContainer() {
            return { containerId: "abc123", action: "restart" };
          },
          async removeContainer() {
            return { containerId: "abc123", action: "remove" };
          },
          async listImages() {
            return [
              {
                id: "sha256:deadbeef",
                tag: "nginx:alpine",
                tags: "nginx:alpine",
                size: "40MB",
                created: 1_700_000_000,
              },
            ];
          },
          async removeImage() {
            return { image: "nginx:alpine", action: "remove" };
          },
          async pullImage() {
            return { image: "nginx:alpine", action: "pull" };
          },
          async listVolumes() {
            return [
              {
                name: "pgdata",
                driver: "local",
                mountpoint: "/var/lib/docker/volumes/pgdata/_data",
                created: "2026-01-01T00:00:00Z",
                size: "120MB",
              },
            ];
          },
          async removeVolume() {
            return { volume: "pgdata", action: "remove" };
          },
          async execOpen() {
            return { sessionId: "s1", containerId: "abc123", status: "open" };
          },
          async execWrite() {},
          async execResize() {},
          async execClose() {},
        },
      },
    });

    await expect(api.docker.ping()).resolves.toMatchObject({ ok: true, apiVersion: "1.45" });
    await expect(api.docker.listContainers()).resolves.toHaveLength(1);
  });

  it("provider native surfaces are unavailable until bridged", async () => {
    const api = createNativeApi({
      bridge: {
        health: async () => ({
          status: "ok",
          phase: "ready",
          kubernetesConnected: false,
          lastAbnormalExit: false,
          logDir: "/tmp",
        }),
      },
    });

    await expect(api.git.listBranches({ repo: "x" })).rejects.toMatchObject({
      code: "NATIVE_UNAVAILABLE",
    });
    await expect(api.ssh.listSessions()).rejects.toMatchObject({ code: "NATIVE_UNAVAILABLE" });
    await expect(api.argocd.listApplications()).rejects.toMatchObject({
      code: "NATIVE_UNAVAILABLE",
    });
    await expect(
      api.harbor.listArtifacts({ project: "library", repository: "nginx" }),
    ).rejects.toMatchObject({ code: "NATIVE_UNAVAILABLE" });
  });
});
