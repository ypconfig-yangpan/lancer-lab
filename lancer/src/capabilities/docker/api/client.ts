/**
 * V2 Docker Capability API — UI → native IPC, no plugin.apply.
 */
import { createDefaultDockerNativeApi } from "@/native/docker-bridge";
import type {
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
} from "@/native/docker";

const docker = createDefaultDockerNativeApi();

export const dockerApi = {
  ping(): Promise<NativeDockerPingResult> {
    return docker.ping();
  },

  listContainers(
    input?: NativeDockerListContainersInput,
  ): Promise<NativeDockerContainerSummary[]> {
    return docker.listContainers(input);
  },

  inspectContainer(containerId: string): Promise<NativeDockerContainerDetail> {
    return docker.inspectContainer(containerId);
  },

  containerLogs(input: NativeDockerContainerLogsInput): Promise<NativeDockerLogLine[]> {
    return docker.containerLogs(input);
  },

  startContainer(containerId: string): Promise<NativeDockerContainerActionResult> {
    return docker.startContainer(containerId);
  },

  stopContainer(containerId: string): Promise<NativeDockerContainerActionResult> {
    return docker.stopContainer(containerId);
  },

  restartContainer(containerId: string): Promise<NativeDockerContainerActionResult> {
    return docker.restartContainer(containerId);
  },

  removeContainer(
    containerId: string,
    options?: { force?: boolean },
  ): Promise<NativeDockerContainerActionResult> {
    return docker.removeContainer(containerId, options);
  },

  listImages(): Promise<NativeDockerImageSummary[]> {
    return docker.listImages();
  },

  removeImage(
    image: string,
    options?: { force?: boolean },
  ): Promise<NativeDockerImageActionResult> {
    return docker.removeImage(image, options);
  },

  pullImage(reference: string): Promise<NativeDockerImageActionResult> {
    return docker.pullImage(reference);
  },

  listVolumes(): Promise<NativeDockerVolumeSummary[]> {
    return docker.listVolumes();
  },

  removeVolume(
    name: string,
    options?: { force?: boolean },
  ): Promise<NativeDockerVolumeActionResult> {
    return docker.removeVolume(name, options);
  },

  execOpen(input: NativeDockerExecOpenInput): Promise<NativeDockerExecSession> {
    return docker.execOpen(input);
  },

  execWrite(input: NativeDockerExecWriteInput): Promise<void> {
    return docker.execWrite(input);
  },

  execResize(input: NativeDockerExecResizeInput): Promise<void> {
    return docker.execResize(input);
  },

  execClose(sessionId: string): Promise<void> {
    return docker.execClose(sessionId);
  },
};

export type DockerApi = typeof dockerApi;
