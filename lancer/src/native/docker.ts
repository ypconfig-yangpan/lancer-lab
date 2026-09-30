/**
 * Docker Engine Native Accelerator surface (bollard / local socket).
 * Default bridge: `createDefaultDockerNativeApi` → Tauri `docker_*` commands.
 */

export interface NativeDockerContainerSummary {
  id: string;
  name: string;
  image: string;
  status: string;
  ports?: string;
  labels?: Record<string, string>;
  cpu?: string;
  memory?: string;
}

export interface NativeDockerListContainersInput {
  host?: string;
  all?: boolean;
}

export interface NativeDockerPingResult {
  ok: boolean;
  apiVersion?: string;
}

export interface NativeDockerLogLine {
  id: string;
  lineNumber: number;
  timestamp: string;
  level: string;
  message: string;
}

export interface NativeDockerContainerLogsInput {
  containerId: string;
  tail?: number;
}

export interface NativeDockerExecSession {
  sessionId: string;
  containerId: string;
  status: string;
}

export interface NativeDockerExecOpenInput {
  containerId: string;
  cols?: number;
  rows?: number;
}

export interface NativeDockerExecWriteInput {
  sessionId: string;
  data: string;
}

export interface NativeDockerExecResizeInput {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface NativeDockerContainerDetail {
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

export interface NativeDockerContainerActionResult {
  containerId: string;
  action: string;
}

export interface NativeDockerImageSummary {
  id: string;
  tag: string;
  tags: string;
  size: string;
  created: number;
}

export interface NativeDockerImageActionResult {
  image: string;
  action: string;
}

export interface NativeDockerVolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  size: string;
}

export interface NativeDockerVolumeActionResult {
  volume: string;
  action: string;
}

export interface NativeDockerApi {
  ping(): Promise<NativeDockerPingResult>;
  listContainers(input?: NativeDockerListContainersInput): Promise<NativeDockerContainerSummary[]>;
  containerLogs(input: NativeDockerContainerLogsInput): Promise<NativeDockerLogLine[]>;
  inspectContainer(containerId: string): Promise<NativeDockerContainerDetail>;
  startContainer(containerId: string): Promise<NativeDockerContainerActionResult>;
  stopContainer(containerId: string): Promise<NativeDockerContainerActionResult>;
  restartContainer(containerId: string): Promise<NativeDockerContainerActionResult>;
  removeContainer(
    containerId: string,
    options?: { force?: boolean },
  ): Promise<NativeDockerContainerActionResult>;
  listImages(): Promise<NativeDockerImageSummary[]>;
  removeImage(image: string, options?: { force?: boolean }): Promise<NativeDockerImageActionResult>;
  pullImage(reference: string): Promise<NativeDockerImageActionResult>;
  listVolumes(): Promise<NativeDockerVolumeSummary[]>;
  removeVolume(
    name: string,
    options?: { force?: boolean },
  ): Promise<NativeDockerVolumeActionResult>;
  /** Interactive container exec (/bin/sh TTY). Not host shell. */
  execOpen(input: NativeDockerExecOpenInput): Promise<NativeDockerExecSession>;
  execWrite(input: NativeDockerExecWriteInput): Promise<void>;
  execResize(input: NativeDockerExecResizeInput): Promise<void>;
  execClose(sessionId: string): Promise<void>;
}
