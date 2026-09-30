//! Jenkins domain build events (Webhook 主路径 + 轮询兜底共用).

use serde::{Deserialize, Serialize};

pub const JENKINS_BUILD_EVENT: &str = "jenkins-build-event";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JenkinsBuildEventKind {
    BuildQueued,
    BuildStarted,
    BuildCompleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsBuildEventDto {
    pub kind: JenkinsBuildEventKind,
    pub job_full_name: String,
    pub number: Option<i64>,
    /// SUCCESS / FAILURE / ABORTED / UNSTABLE / RUNNING / NOT_BUILT / …
    pub result: Option<String>,
    pub duration_ms: Option<i64>,
    pub source: JenkinsEventSource,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JenkinsEventSource {
    Webhook,
    Poll,
}
