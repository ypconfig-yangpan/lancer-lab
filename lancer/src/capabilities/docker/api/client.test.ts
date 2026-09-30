import { describe, expect, it, vi } from "vitest";
import { dockerApi } from "./client";

vi.mock("@/native/docker-bridge", () => ({
  createDefaultDockerNativeApi: () => ({
    ping: vi.fn(async () => ({ ok: true, apiVersion: "1.45" })),
    listContainers: vi.fn(async () => [
      {
        id: "abc123",
        name: "nginx",
        image: "nginx:1.27",
        status: "Running",
        ports: "80:8080",
        labels: { app: "edge" },
        cpu: "2%",
        memory: "64MB",
      },
    ]),
    inspectContainer: vi.fn(),
    containerLogs: vi.fn(),
    startContainer: vi.fn(),
    stopContainer: vi.fn(),
    restartContainer: vi.fn(),
    removeContainer: vi.fn(),
    listImages: vi.fn(async () => [
      {
        id: "sha256:abc",
        tag: "nginx:alpine",
        tags: "nginx:alpine",
        size: "40MB",
        created: 1_700_000_000,
      },
    ]),
    removeImage: vi.fn(async () => ({ image: "nginx:alpine", action: "remove" })),
    pullImage: vi.fn(async () => ({ image: "nginx:alpine", action: "pull" })),
    listVolumes: vi.fn(async () => [
      {
        name: "pgdata",
        driver: "local",
        mountpoint: "/var/lib/docker/volumes/pgdata/_data",
        created: "2026-01-01T00:00:00Z",
        size: "120MB",
      },
    ]),
    removeVolume: vi.fn(async () => ({ volume: "pgdata", action: "remove" })),
    execOpen: vi.fn(),
    execWrite: vi.fn(),
    execResize: vi.fn(),
    execClose: vi.fn(),
  }),
}));

describe("dockerApi", () => {
  it("lists containers via native without plugin.apply", async () => {
    const rows = await dockerApi.listContainers({ all: true });
    expect(rows[0]?.name).toBe("nginx");
  });

  it("pings engine via native", async () => {
    const ping = await dockerApi.ping();
    expect(ping.ok).toBe(true);
    expect(ping.apiVersion).toBe("1.45");
  });

  it("lists images via native", async () => {
    const rows = await dockerApi.listImages();
    expect(rows[0]?.tag).toBe("nginx:alpine");
  });

  it("lists volumes via native", async () => {
    const rows = await dockerApi.listVolumes();
    expect(rows[0]?.name).toBe("pgdata");
  });
});
