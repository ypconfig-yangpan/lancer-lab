/** Pure frontend mock for Jenkins Dashboard. */

export interface MockBuild {
  id: string;
  jobId: string;
  jobName: string;
  status: "SUCCESS" | "FAILURE" | "RUNNING";
  buildNumber: number;
  duration: string;
  time: string;
}

export interface MockJob {
  id: string;
  name: string;
  type: string;
  project: string;
  branch: string;
  lastBuild: string;
}

export interface MockPipelineStage {
  id: string;
  name: string;
  status: "done" | "running" | "pending" | "failed";
}

export const JENKINS_MOCK_SERVER = "jenkins-server";

export const JENKINS_MOCK_STATS = {
  totalJobs: 12,
  building: 2,
  successRate: "98%",
  avgDuration: "2m 34s",
};

export const JENKINS_MOCK_JOBS: MockJob[] = [
  {
    id: "job-deploy",
    name: "deploy-staging",
    type: "Pipeline",
    project: "lancer",
    branch: "main",
    lastBuild: "#88 · SUCCESS",
  },
  {
    id: "job-billing",
    name: "billing-ci",
    type: "Pipeline",
    project: "billing",
    branch: "develop",
    lastBuild: "#142 · SUCCESS",
  },
  {
    id: "job-iam",
    name: "iam-pipeline",
    type: "Freestyle",
    project: "iam",
    branch: "main",
    lastBuild: "#88 · FAILURE",
  },
];

export const JENKINS_MOCK_BUILDS: MockBuild[] = [
  {
    id: "b1",
    jobId: "job-deploy",
    jobName: "deploy-staging",
    status: "SUCCESS",
    buildNumber: 88,
    duration: "3m 12s",
    time: "10m ago",
  },
  {
    id: "b2",
    jobId: "job-billing",
    jobName: "billing-ci",
    status: "RUNNING",
    buildNumber: 143,
    duration: "1m 02s",
    time: "now",
  },
  {
    id: "b3",
    jobId: "job-iam",
    jobName: "iam-pipeline",
    status: "FAILURE",
    buildNumber: 88,
    duration: "4m 40s",
    time: "1h ago",
  },
  {
    id: "b4",
    jobId: "job-billing",
    jobName: "billing-ci",
    status: "SUCCESS",
    buildNumber: 142,
    duration: "2m 18s",
    time: "3h ago",
  },
  {
    id: "b5",
    jobId: "job-deploy",
    jobName: "deploy-staging",
    status: "SUCCESS",
    buildNumber: 87,
    duration: "2m 55s",
    time: "1d ago",
  },
];

export const JENKINS_MOCK_TREND = [4, 5, 3, 6, 5, 7, 4, 6, 5, 8, 6, 7];

export const JENKINS_MOCK_PIPELINE: MockPipelineStage[] = [
  { id: "s1", name: "Checkout", status: "done" },
  { id: "s2", name: "Build", status: "done" },
  { id: "s3", name: "Test", status: "running" },
  { id: "s4", name: "Deploy", status: "pending" },
  { id: "s5", name: "Finish", status: "pending" },
];

export const JENKINS_MOCK_LOGS = [
  "Started by user yangpan",
  "[Pipeline] Start of Pipeline",
  "[Pipeline] stage (Checkout)",
  "Checking out git main",
  "[Pipeline] stage (Build)",
  "mvn -B package",
  "[Pipeline] stage (Test)",
  "Running unit tests…",
];

export const JENKINS_MOCK_OPS = [
  "Create Task",
  "View View",
  "Manage Jenkins",
  "Plugin Management",
];
