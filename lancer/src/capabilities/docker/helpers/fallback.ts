import { isNativeCapabilityError } from "@/native/errors";
import type {
  NativeDockerContainerDetail,
  NativeDockerContainerSummary,
  NativeDockerLogLine,
} from "@/native/docker";
import { dockerApi } from "../api/client";
import { getDockerContainer, type DockerContainerRow } from "./mock-data";

export function shouldFallbackToMock(error: unknown): boolean {
  return (
    isNativeCapabilityError(error) &&
    (error.code === "NATIVE_UNAVAILABLE" ||
      error.code === "DOCKER_UNAVAILABLE" ||
      error.code === "NATIVE_BRIDGE_FAILED")
  );
}

export function nativeSummaryToRow(c: NativeDockerContainerSummary): DockerContainerRow {
  const state = (c.status ?? "").toLowerCase();
  const group = state.includes("exit") ? "exited" : "running";
  return {
    id: c.id,
    name: c.name,
    host: "local",
    group,
    image: c.image,
    status: c.status,
    ports: c.ports ?? "—",
    cpu: c.cpu ?? "—",
    memory: c.memory ?? "—",
    uptime: "—",
    labels: c.labels ?? {},
    notes: "Live from Docker Engine (dockerApi).",
  };
}

export function detailToRow(d: NativeDockerContainerDetail): DockerContainerRow {
  const state = d.status.toLowerCase();
  const group = state.includes("exit") ? "exited" : "running";
  return {
    id: d.id,
    name: d.name,
    host: "local",
    group,
    image: d.image,
    imageId: d.imageId,
    status: d.status,
    health: d.health,
    created: d.created,
    command: d.command,
    restartPolicy: d.restartPolicy,
    network: d.network,
    ipAddress: d.ipAddress,
    ports: d.ports,
    mounts: d.mounts,
    cpu: d.cpu,
    memory: d.memory,
    uptime: "—",
    labels: d.labels,
    notes: "Inspect from Docker Engine.",
  };
}

export async function listContainersWithFallback(
  filter: Record<string, unknown> = {},
): Promise<{ rows: DockerContainerRow[]; source: "native" | "mock"; kind?: string }> {
  const group = typeof filter.group === "string" ? filter.group : undefined;
  if (group === "images" || group === "volumes") {
    return { rows: [], source: "native", kind: group };
  }
  try {
    const nativeRows = await dockerApi.listContainers({ host: "local", all: true });
    let rows = nativeRows.map(nativeSummaryToRow);
    if (group && group !== "all") {
      rows = rows.filter((r) => r.group === group);
    }
    return { rows, source: "native" };
  } catch (error: unknown) {
    if (!shouldFallbackToMock(error)) {
      throw error;
    }
  }
  return { rows: [], source: "mock" as const };
}

export async function inspectContainerWithFallback(
  containerId: string,
): Promise<{ row: DockerContainerRow; source: "native" | "mock" }> {
  try {
    const detail = await dockerApi.inspectContainer(containerId);
    return { row: detailToRow(detail), source: "native" };
  } catch (error: unknown) {
    if (!shouldFallbackToMock(error)) {
      throw error;
    }
  }
  const row = getDockerContainer(containerId);
  if (!row) {
    throw new Error("Container not found");
  }
  return { row, source: "mock" };
}

export async function containerLogsWithFallback(input: {
  containerId: string;
  tail?: number;
}): Promise<{ lines: NativeDockerLogLine[]; source: "native" | "mock" }> {
  try {
    const lines = await dockerApi.containerLogs({
      containerId: input.containerId,
      tail: input.tail ?? 200,
    });
    return { lines, source: "native" };
  } catch (error: unknown) {
    if (!shouldFallbackToMock(error)) {
      throw error;
    }
  }
  return {
    source: "mock",
    lines: [
      {
        id: "mock-1",
        lineNumber: 1,
        timestamp: "",
        level: "WARN",
        message: `Docker Engine unavailable — mock logs for ${input.containerId}`,
      },
      {
        id: "mock-2",
        lineNumber: 2,
        timestamp: "",
        level: "INFO",
        message: "Start OrbStack / Docker Desktop to stream real container logs",
      },
    ],
  };
}

export async function execOpenWithFallback(input: {
  containerId: string;
  cols?: number;
  rows?: number;
}): Promise<{
  sessionId: string;
  containerId: string;
  status: string;
  source: "native" | "mock";
}> {
  try {
    const openInput: { containerId: string; cols?: number; rows?: number } = {
      containerId: input.containerId,
    };
    if (typeof input.cols === "number") {
      openInput.cols = input.cols;
    }
    if (typeof input.rows === "number") {
      openInput.rows = input.rows;
    }
    const session = await dockerApi.execOpen(openInput);
    return { ...session, source: "native" };
  } catch (error: unknown) {
    if (!shouldFallbackToMock(error)) {
      throw error;
    }
  }
  return {
    source: "mock",
    sessionId: `mock-exec-${input.containerId.slice(0, 12)}`,
    containerId: input.containerId,
    status: "mock",
  };
}
