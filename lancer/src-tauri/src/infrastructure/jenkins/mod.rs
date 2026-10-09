//! Jenkins HTTP client (Basic auth + JSON API).

mod activity;
mod client;
mod events;
mod webhook;

pub use activity::JenkinsActivityListenManager;
pub use client::{
    JenkinsActivitySnapshotDto, JenkinsBuildDetailDto, JenkinsBuildSummaryDto,
    JenkinsBuildTriggerResultDto, JenkinsClient, JenkinsConnectResultDto, JenkinsConsoleChunkDto,
    JenkinsExecutorStatusDto, JenkinsJobConfigDto, JenkinsJobDetailDto, JenkinsJobSummaryDto,
    JenkinsQueueItemDto, JenkinsStatusDto,
};
pub use webhook::{JenkinsWebhookListenConfig, JenkinsWebhookListenManager};
