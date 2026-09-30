import { invokeCommand, TauriInvokeError } from "@/shared/tauri";
import { NativeCapabilityError, type NativeErrorCode } from "./errors";

export interface NativeJenkinsConnectResult {
  baseUrl: string;
  username: string;
  mode: string;
  webhookEnabled: boolean;
  webhookUrl: string;
}

export interface NativeJenkinsStatus {
  connected: boolean;
  baseUrl: string;
  username: string;
  webhookEnabled: boolean;
  webhookUrl: string;
}

export interface NativeJenkinsJobSummary {
  fullName: string;
  name: string;
  folder: string;
  url: string;
  className: string;
  color: string;
  building: boolean;
  lastBuildNumber: number | null;
  lastBuildResult: string;
  lastBuildTimestamp: number | null;
  lastBuildDurationMs: number | null;
  lastSuccessfulNumber: number | null;
  lastSuccessfulTimestamp: number | null;
  lastFailedNumber: number | null;
  lastFailedTimestamp: number | null;
}

export interface NativeJenkinsBuildSummary {
  id: string;
  jobFullName: string;
  number: number;
  result: string;
  building: boolean;
  timestamp: number;
  durationMs: number;
  url: string;
}

export interface NativeJenkinsChangeItem {
  commitId: string;
  author: string;
  message: string;
}

export interface NativeJenkinsBuildDetail {
  id: string;
  jobFullName: string;
  number: number;
  result: string;
  building: boolean;
  timestamp: number;
  durationMs: number;
  estimatedDurationMs: number;
  url: string;
  builtOn: string;
  cause: string;
  changes: NativeJenkinsChangeItem[];
}

export interface NativeJenkinsConsoleChunk {
  text: string;
  nextStart: number;
  moreData: boolean;
}

export interface NativeJenkinsExecutorStatus {
  busy: number;
  total: number;
  running: NativeJenkinsRunningBuild[];
}

export interface NativeJenkinsRunningBuild {
  displayName: string;
  jobFullName: string;
  number: number;
  url: string;
  nodeName: string;
}

export interface NativeJenkinsQueueItem {
  id: number;
  taskName: string;
  taskFullName: string;
  taskUrl: string;
  why: string;
  stuck: boolean;
  blocked: boolean;
  buildable: boolean;
  pending: boolean;
  inQueueSince: number | null;
  params: string;
  causes: string;
  url: string;
}

export interface NativeJenkinsActivitySnapshot {
  queue: NativeJenkinsQueueItem[];
  executors: NativeJenkinsExecutorStatus;
  fingerprint: string;
}

export const JENKINS_ACTIVITY_EVENT = "jenkins-activity";
export const JENKINS_BUILD_EVENT = "jenkins-build-event";

export type NativeJenkinsBuildEventKind = "buildQueued" | "buildStarted" | "buildCompleted";
export type NativeJenkinsEventSource = "webhook" | "poll";

export interface NativeJenkinsBuildEvent {
  kind: NativeJenkinsBuildEventKind;
  jobFullName: string;
  number: number | null;
  result: string | null;
  durationMs: number | null;
  source: NativeJenkinsEventSource;
  message: string;
}


export interface NativeJenkinsParameter {
  name: string;
  paramType: string;
  defaultValue: string;
  choices: string[];
}

export interface NativeJenkinsJobDetail {
  fullName: string;
  name: string;
  buildable: boolean;
  url: string;
  className: string;
  parameters: NativeJenkinsParameter[];
}

export interface NativeJenkinsJobConfig {
  jobFullName: string;
  xml: string;
}

export interface NativeJenkinsBuildTriggerResult {
  jobFullName: string;
  queueUrl: string;
}

export interface NativeJenkinsListBuildsInput {
  jobFullName: string;
  limit?: number;
}

export interface NativeJenkinsApi {
  connect(input?: { configPath?: string }): Promise<NativeJenkinsConnectResult>;
  disconnect(): Promise<void>;
  status(): Promise<NativeJenkinsStatus>;
  listJobs(): Promise<NativeJenkinsJobSummary[]>;
  listBuilds(input: NativeJenkinsListBuildsInput): Promise<NativeJenkinsBuildSummary[]>;
  getJob(jobFullName: string): Promise<NativeJenkinsJobDetail>;
  getJobConfig(jobFullName: string): Promise<NativeJenkinsJobConfig>;
  updateJobConfig(input: {
    jobFullName: string;
    xml: string;
  }): Promise<NativeJenkinsJobConfig>;
  buildJob(input: {
    jobFullName: string;
    parameters?: Record<string, string>;
  }): Promise<NativeJenkinsBuildTriggerResult>;
  getBuild(input: { jobFullName: string; number: number }): Promise<NativeJenkinsBuildDetail>;
  getConsole(input: {
    jobFullName: string;
    number: number;
    start?: number;
  }): Promise<NativeJenkinsConsoleChunk>;
  stopBuild(input: { jobFullName: string; number: number }): Promise<void>;
  executorStatus(): Promise<NativeJenkinsExecutorStatus>;
  listQueue(): Promise<NativeJenkinsQueueItem[]>;
  cancelQueueItem(id: number): Promise<void>;
  activitySnapshot(): Promise<NativeJenkinsActivitySnapshot>;
}

const JENKINS_CODES = new Set([
  "JENKINS_CONFIG_INVALID",
  "JENKINS_AUTH_FAILED",
  "JENKINS_UNREACHABLE",
  "JENKINS_HTTP_ERROR",
  "JENKINS_NOT_CONNECTED",
  "JENKINS_BAD_REQUEST",
]);

async function bridgeCall<T>(capability: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    if (error instanceof NativeCapabilityError) {
      throw error;
    }
    if (error instanceof TauriInvokeError) {
      const code = error.appError.code;
      if (JENKINS_CODES.has(code)) {
        throw new NativeCapabilityError(code as NativeErrorCode, error.appError.message, {
          retryable: error.appError.retryable,
        });
      }
      throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", error.appError.message, {
        retryable: true,
      });
    }
    const message = error instanceof Error ? error.message : `${capability} failed`;
    throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", message, { retryable: true });
  }
}

export function createDefaultJenkinsNativeApi(): NativeJenkinsApi {
  return {
    connect(input) {
      return bridgeCall("jenkins.connect", () =>
        invokeCommand<NativeJenkinsConnectResult>("jenkins_connect", {
          input: { configPath: input?.configPath },
        }),
      );
    },
    disconnect() {
      return bridgeCall("jenkins.disconnect", () => invokeCommand("jenkins_disconnect"));
    },
    status() {
      return bridgeCall("jenkins.status", () =>
        invokeCommand<NativeJenkinsStatus>("jenkins_status"),
      );
    },
    listJobs() {
      return bridgeCall("jenkins.listJobs", () =>
        invokeCommand<NativeJenkinsJobSummary[]>("jenkins_list_jobs"),
      );
    },
    listBuilds(input) {
      return bridgeCall("jenkins.listBuilds", () =>
        invokeCommand<NativeJenkinsBuildSummary[]>("jenkins_list_builds", {
          input: {
            jobFullName: input.jobFullName,
            limit: input.limit,
          },
        }),
      );
    },
    getJob(jobFullName) {
      return bridgeCall("jenkins.getJob", () =>
        invokeCommand<NativeJenkinsJobDetail>("jenkins_get_job", {
          input: { jobFullName },
        }),
      );
    },
    getJobConfig(jobFullName) {
      return bridgeCall("jenkins.getJobConfig", () =>
        invokeCommand<NativeJenkinsJobConfig>("jenkins_get_job_config", {
          input: { jobFullName },
        }),
      );
    },
    updateJobConfig(input) {
      return bridgeCall("jenkins.updateJobConfig", () =>
        invokeCommand<NativeJenkinsJobConfig>("jenkins_update_job_config", {
          input: {
            jobFullName: input.jobFullName,
            xml: input.xml,
          },
        }),
      );
    },
    buildJob(input) {
      return bridgeCall("jenkins.buildJob", () =>
        invokeCommand<NativeJenkinsBuildTriggerResult>("jenkins_build_job", {
          input: {
            jobFullName: input.jobFullName,
            parameters: input.parameters ?? {},
          },
        }),
      );
    },
    getBuild(input) {
      return bridgeCall("jenkins.getBuild", () =>
        invokeCommand<NativeJenkinsBuildDetail>("jenkins_get_build", {
          input: { jobFullName: input.jobFullName, number: input.number },
        }),
      );
    },
    getConsole(input) {
      return bridgeCall("jenkins.getConsole", () =>
        invokeCommand<NativeJenkinsConsoleChunk>("jenkins_get_console", {
          input: {
            jobFullName: input.jobFullName,
            number: input.number,
            start: input.start ?? 0,
          },
        }),
      );
    },
    stopBuild(input) {
      return bridgeCall("jenkins.stopBuild", () =>
        invokeCommand("jenkins_stop_build", {
          input: { jobFullName: input.jobFullName, number: input.number },
        }),
      );
    },
    executorStatus() {
      return bridgeCall("jenkins.executorStatus", () =>
        invokeCommand<NativeJenkinsExecutorStatus>("jenkins_executor_status"),
      );
    },
    listQueue() {
      return bridgeCall("jenkins.listQueue", () =>
        invokeCommand<NativeJenkinsQueueItem[]>("jenkins_list_queue"),
      );
    },
    cancelQueueItem(id) {
      return bridgeCall("jenkins.cancelQueueItem", () =>
        invokeCommand("jenkins_cancel_queue_item", { input: { id } }),
      );
    },
    activitySnapshot() {
      return bridgeCall("jenkins.activitySnapshot", () =>
        invokeCommand<NativeJenkinsActivitySnapshot>("jenkins_activity_snapshot"),
      );
    },
  };
}
