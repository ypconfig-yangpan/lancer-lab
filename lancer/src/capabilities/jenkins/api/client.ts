/**
 * V2 Jenkins Capability API — UI → native IPC.
 */
import {
  createDefaultJenkinsNativeApi,
  type NativeJenkinsActivitySnapshot,
  type NativeJenkinsBuildDetail,
  type NativeJenkinsBuildSummary,
  type NativeJenkinsBuildTriggerResult,
  type NativeJenkinsConnectResult,
  type NativeJenkinsConsoleChunk,
  type NativeJenkinsExecutorStatus,
  type NativeJenkinsJobDetail,
  type NativeJenkinsJobConfig,
  type NativeJenkinsJobSummary,
  type NativeJenkinsQueueItem,
  type NativeJenkinsRunningBuild,
  type NativeJenkinsStatus,
} from "@/native/jenkins";

const jenkins = createDefaultJenkinsNativeApi();

export type JenkinsConnectResult = NativeJenkinsConnectResult;
export type JenkinsStatus = NativeJenkinsStatus;
export type JenkinsJobSummary = NativeJenkinsJobSummary;
export type JenkinsBuildSummary = NativeJenkinsBuildSummary;
export type JenkinsBuildDetail = NativeJenkinsBuildDetail;
export type JenkinsJobDetail = NativeJenkinsJobDetail;
export type JenkinsJobConfig = NativeJenkinsJobConfig;
export type JenkinsBuildTriggerResult = NativeJenkinsBuildTriggerResult;
export type JenkinsConsoleChunk = NativeJenkinsConsoleChunk;
export type JenkinsExecutorStatus = NativeJenkinsExecutorStatus;
export type JenkinsRunningBuild = NativeJenkinsRunningBuild;
export type JenkinsQueueItem = NativeJenkinsQueueItem;
export type JenkinsActivitySnapshot = NativeJenkinsActivitySnapshot;

export const jenkinsApi = {
  connect(input?: { configPath?: string }): Promise<JenkinsConnectResult> {
    return jenkins.connect(input);
  },
  disconnect(): Promise<void> {
    return jenkins.disconnect();
  },
  status(): Promise<JenkinsStatus> {
    return jenkins.status();
  },
  listJobs(): Promise<JenkinsJobSummary[]> {
    return jenkins.listJobs();
  },
  listBuilds(input: {
    jobFullName: string;
    limit?: number;
  }): Promise<JenkinsBuildSummary[]> {
    return jenkins.listBuilds(input);
  },
  getJob(jobFullName: string): Promise<JenkinsJobDetail> {
    return jenkins.getJob(jobFullName);
  },
  getJobConfig(jobFullName: string): Promise<JenkinsJobConfig> {
    return jenkins.getJobConfig(jobFullName);
  },
  updateJobConfig(input: {
    jobFullName: string;
    xml: string;
  }): Promise<JenkinsJobConfig> {
    return jenkins.updateJobConfig(input);
  },
  buildJob(input: {
    jobFullName: string;
    parameters?: Record<string, string>;
  }): Promise<JenkinsBuildTriggerResult> {
    return jenkins.buildJob(input);
  },
  getBuild(input: { jobFullName: string; number: number }): Promise<JenkinsBuildDetail> {
    return jenkins.getBuild(input);
  },
  getConsole(input: {
    jobFullName: string;
    number: number;
    start?: number;
  }): Promise<JenkinsConsoleChunk> {
    return jenkins.getConsole(input);
  },
  stopBuild(input: { jobFullName: string; number: number }): Promise<void> {
    return jenkins.stopBuild(input);
  },
  executorStatus(): Promise<JenkinsExecutorStatus> {
    return jenkins.executorStatus();
  },
  listQueue(): Promise<JenkinsQueueItem[]> {
    return jenkins.listQueue();
  },
  cancelQueueItem(id: number): Promise<void> {
    return jenkins.cancelQueueItem(id);
  },
  activitySnapshot(): Promise<JenkinsActivitySnapshot> {
    return jenkins.activitySnapshot();
  },
};
