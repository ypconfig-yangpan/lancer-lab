/**
 * Docker Engine Native Accelerator — bollard via Tauri (local socket / OrbStack).
 */

import { invokeCommand, TauriInvokeError } from "@/shared/tauri";
import { NativeCapabilityError, type NativeErrorCode } from "./errors";
import type {
  NativeDockerApi,
  NativeDockerContainerActionResult,
  NativeDockerContainerDetail,
  NativeDockerContainerLogsInput,
  NativeDockerContainerSummary,
  NativeDockerExecOpenInput,
  NativeDockerExecResizeInput,
  NativeDockerExecSession,
  NativeDockerExecWriteInput,
  NativeDockerImageActionResult,
  NativeDockerImageSummary,
  NativeDockerListContainersInput,
  NativeDockerLogLine,
  NativeDockerPingResult,
  NativeDockerVolumeActionResult,
  NativeDockerVolumeSummary,
} from "./docker";

interface DockerPingDto {
  ok: boolean;
  apiVersion?: string | null;
}

interface DockerContainerSummaryDto {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  labels: Record<string, string>;
  cpu?: string;
  memory?: string;
}

interface DockerLogLineDto {
  id: string;
  lineNumber: number;
  timestamp: string;
  level: string;
  message: string;
}

interface DockerExecSessionDto {
  sessionId: string;
  containerId: string;
  status: string;
}

interface DockerContainerActionResultDto {
  containerId: string;
  action: string;
}

interface DockerImageSummaryDto {
  id: string;
  tag: string;
  tags: string;
  size: string;
  created: number;
}

interface DockerImageActionResultDto {
  image: string;
  action: string;
}

interface DockerVolumeSummaryDto {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  size: string;
}

interface DockerVolumeActionResultDto {
  volume: string;
  action: string;
}

interface DockerContainerDetailDto {
  id: string;
  name: string;
  image: string;
  imageId: string;
  status: string;
  health: string;
  created: string;
  command: string;
  restartPolicy: string;
  network: string;
  ipAddress: string;
  ports: string;
  mounts: string;
  labels: Record<string, string>;
  cpu: string;
  memory: string;
}

function mapDockerError(error: unknown, capability: string): never {
  if (error instanceof NativeCapabilityError) {
    throw error;
  }
  if (error instanceof TauriInvokeError) {
    const code = error.appError.code;
    if (
      code === "DOCKER_UNAVAILABLE" ||
      code === "DOCKER_ENGINE_FAILED" ||
      code === "TERMINAL_OPEN_FAILED" ||
      code === "TERMINAL_DISCONNECTED" ||
      code === "TERMINAL_PERMISSION_DENIED"
    ) {
      throw new NativeCapabilityError(code as NativeErrorCode, error.appError.message, {
        retryable: error.appError.retryable,
      });
    }
    throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", error.appError.message, {
      retryable: true,
    });
  }
  const message = error instanceof Error ? error.message : `${capability} failed`;
  throw new NativeCapabilityError("DOCKER_UNAVAILABLE", message, { retryable: true });
}

async function bridgeCall<T>(capability: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    mapDockerError(error, capability);
  }
}

function mapContainer(dto: DockerContainerSummaryDto): NativeDockerContainerSummary {
  const state = dto.state.toLowerCase();
  const statusLabel =
    state === "running"
      ? "Running"
      : state === "exited"
        ? "Exited"
        : dto.status || dto.state || "Unknown";
  return {
    id: dto.id,
    name: dto.name,
    image: dto.image,
    status: statusLabel,
    ports: dto.ports,
    labels: dto.labels,
    cpu: dto.cpu ?? "—",
    memory: dto.memory ?? "—",
  };
}

/** Default: Tauri → bollard local Engine. */
export function createDefaultDockerNativeApi(): NativeDockerApi {
  return {
    ping(): Promise<NativeDockerPingResult> {
      return bridgeCall("docker.ping", async () => {
        const dto = await invokeCommand<DockerPingDto>("docker_ping");
        return {
          ok: dto.ok,
          ...(dto.apiVersion ? { apiVersion: dto.apiVersion } : {}),
        };
      });
    },

    listContainers(input?: NativeDockerListContainersInput): Promise<NativeDockerContainerSummary[]> {
      return bridgeCall("docker.listContainers", async () => {
        const rows = await invokeCommand<DockerContainerSummaryDto[]>("docker_list_containers", {
          input: { all: input?.all ?? true },
        });
        return rows.map(mapContainer);
      });
    },

    containerLogs(input: NativeDockerContainerLogsInput): Promise<NativeDockerLogLine[]> {
      return bridgeCall("docker.containerLogs", async () => {
        const rows = await invokeCommand<DockerLogLineDto[]>("docker_container_logs", {
          input: {
            containerId: input.containerId,
            tail: input.tail ?? 200,
          },
        });
        return rows.map((r) => ({
          id: r.id,
          lineNumber: r.lineNumber,
          timestamp: r.timestamp,
          level: r.level,
          message: r.message,
        }));
      });
    },

    inspectContainer(containerId: string): Promise<NativeDockerContainerDetail> {
      return bridgeCall("docker.inspectContainer", async () => {
        const dto = await invokeCommand<DockerContainerDetailDto>("docker_inspect_container", {
          input: { containerId },
        });
        return {
          id: dto.id,
          name: dto.name,
          image: dto.image,
          imageId: dto.imageId,
          status: dto.status,
          health: dto.health,
          created: dto.created,
          command: dto.command,
          restartPolicy: dto.restartPolicy,
          network: dto.network,
          ipAddress: dto.ipAddress,
          ports: dto.ports,
          mounts: dto.mounts,
          labels: dto.labels,
          cpu: dto.cpu,
          memory: dto.memory,
        };
      });
    },

    startContainer(containerId: string): Promise<NativeDockerContainerActionResult> {
      return bridgeCall("docker.startContainer", async () => {
        const dto = await invokeCommand<DockerContainerActionResultDto>("docker_start_container", {
          input: { containerId },
        });
        return { containerId: dto.containerId, action: dto.action };
      });
    },

    stopContainer(containerId: string): Promise<NativeDockerContainerActionResult> {
      return bridgeCall("docker.stopContainer", async () => {
        const dto = await invokeCommand<DockerContainerActionResultDto>("docker_stop_container", {
          input: { containerId },
        });
        return { containerId: dto.containerId, action: dto.action };
      });
    },

    restartContainer(containerId: string): Promise<NativeDockerContainerActionResult> {
      return bridgeCall("docker.restartContainer", async () => {
        const dto = await invokeCommand<DockerContainerActionResultDto>(
          "docker_restart_container",
          { input: { containerId } },
        );
        return { containerId: dto.containerId, action: dto.action };
      });
    },

    removeContainer(
      containerId: string,
      options?: { force?: boolean },
    ): Promise<NativeDockerContainerActionResult> {
      return bridgeCall("docker.removeContainer", async () => {
        const dto = await invokeCommand<DockerContainerActionResultDto>(
          "docker_remove_container",
          { input: { containerId, force: options?.force ?? false } },
        );
        return { containerId: dto.containerId, action: dto.action };
      });
    },

    listImages(): Promise<NativeDockerImageSummary[]> {
      return bridgeCall("docker.listImages", async () => {
        const rows = await invokeCommand<DockerImageSummaryDto[]>("docker_list_images");
        return rows.map((r) => ({
          id: r.id,
          tag: r.tag,
          tags: r.tags,
          size: r.size,
          created: r.created,
        }));
      });
    },

    removeImage(
      image: string,
      options?: { force?: boolean },
    ): Promise<NativeDockerImageActionResult> {
      return bridgeCall("docker.removeImage", async () => {
        const dto = await invokeCommand<DockerImageActionResultDto>("docker_remove_image", {
          input: { image, force: options?.force ?? false },
        });
        return { image: dto.image, action: dto.action };
      });
    },

    pullImage(reference: string): Promise<NativeDockerImageActionResult> {
      return bridgeCall("docker.pullImage", async () => {
        const dto = await invokeCommand<DockerImageActionResultDto>("docker_pull_image", {
          input: { reference },
        });
        return { image: dto.image, action: dto.action };
      });
    },

    listVolumes(): Promise<NativeDockerVolumeSummary[]> {
      return bridgeCall("docker.listVolumes", async () => {
        const rows = await invokeCommand<DockerVolumeSummaryDto[]>("docker_list_volumes");
        return rows.map((r) => ({
          name: r.name,
          driver: r.driver,
          mountpoint: r.mountpoint,
          created: r.created,
          size: r.size,
        }));
      });
    },

    removeVolume(
      name: string,
      options?: { force?: boolean },
    ): Promise<NativeDockerVolumeActionResult> {
      return bridgeCall("docker.removeVolume", async () => {
        const dto = await invokeCommand<DockerVolumeActionResultDto>("docker_remove_volume", {
          input: { name, force: options?.force ?? false },
        });
        return { volume: dto.volume, action: dto.action };
      });
    },

    execOpen(input: NativeDockerExecOpenInput): Promise<NativeDockerExecSession> {
      return bridgeCall("docker.execOpen", async () => {
        const dto = await invokeCommand<DockerExecSessionDto>("docker_exec_open", {
          input: {
            containerId: input.containerId,
            cols: input.cols,
            rows: input.rows,
          },
        });
        return {
          sessionId: dto.sessionId,
          containerId: dto.containerId,
          status: dto.status,
        };
      });
    },

    execWrite(input: NativeDockerExecWriteInput): Promise<void> {
      return bridgeCall("docker.execWrite", async () => {
        await invokeCommand("docker_exec_write", {
          input: { sessionId: input.sessionId, data: input.data },
        });
      });
    },

    execResize(input: NativeDockerExecResizeInput): Promise<void> {
      return bridgeCall("docker.execResize", async () => {
        await invokeCommand("docker_exec_resize", {
          input: {
            sessionId: input.sessionId,
            cols: input.cols,
            rows: input.rows,
          },
        });
      });
    },

    execClose(sessionId: string): Promise<void> {
      return bridgeCall("docker.execClose", async () => {
        await invokeCommand("docker_exec_close", {
          input: { sessionId },
        });
      });
    },
  };
}
