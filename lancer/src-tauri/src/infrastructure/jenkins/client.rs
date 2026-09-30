use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use reqwest::{Client, StatusCode};
use serde::Deserialize;
use tokio::sync::RwLock;
use tracing::info;

use crate::domain::error::AppError;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JenkinsConfigFile {
    base_url: String,
    username: String,
    api_token: String,
    #[serde(default)]
    webhook: Option<JenkinsWebhookFileConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JenkinsWebhookFileConfig {
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    port: Option<u16>,
    #[serde(default)]
    token: Option<String>,
}

#[derive(Clone, Default)]
struct JenkinsSession {
    base_url: String,
    username: String,
    api_token: String,
    http: Client,
    webhook: JenkinsWebhookRuntime,
}

#[derive(Clone, Default)]
struct JenkinsWebhookRuntime {
    enabled: bool,
    port: u16,
    token: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsConnectResultDto {
    pub base_url: String,
    pub username: String,
    pub mode: String,
    pub webhook_enabled: bool,
    pub webhook_url: String,
}

#[derive(Clone, Default)]
pub struct JenkinsClient {
    inner: Arc<RwLock<Option<JenkinsSession>>>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsStatusDto {
    pub connected: bool,
    pub base_url: String,
    pub username: String,
    pub webhook_enabled: bool,
    pub webhook_url: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsJobSummaryDto {
    pub full_name: String,
    pub name: String,
    pub folder: String,
    pub url: String,
    pub class_name: String,
    pub color: String,
    pub building: bool,
    pub last_build_number: Option<i64>,
    pub last_build_result: String,
    pub last_build_timestamp: Option<i64>,
    pub last_build_duration_ms: Option<i64>,
    pub last_successful_number: Option<i64>,
    pub last_successful_timestamp: Option<i64>,
    pub last_failed_number: Option<i64>,
    pub last_failed_timestamp: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsBuildSummaryDto {
    pub id: String,
    pub job_full_name: String,
    pub number: i64,
    pub result: String,
    pub building: bool,
    pub timestamp: i64,
    pub duration_ms: i64,
    pub url: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsParameterDto {
    pub name: String,
    pub param_type: String,
    pub default_value: String,
    pub choices: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsJobDetailDto {
    pub full_name: String,
    pub name: String,
    pub buildable: bool,
    pub url: String,
    pub class_name: String,
    pub parameters: Vec<JenkinsParameterDto>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsJobConfigDto {
    pub job_full_name: String,
    pub xml: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsBuildTriggerResultDto {
    pub job_full_name: String,
    pub queue_url: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsChangeItemDto {
    pub commit_id: String,
    pub author: String,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsBuildDetailDto {
    pub id: String,
    pub job_full_name: String,
    pub number: i64,
    pub result: String,
    pub building: bool,
    pub timestamp: i64,
    pub duration_ms: i64,
    pub estimated_duration_ms: i64,
    pub url: String,
    pub built_on: String,
    pub cause: String,
    pub changes: Vec<JenkinsChangeItemDto>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsConsoleChunkDto {
    pub text: String,
    pub next_start: i64,
    pub more_data: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsRunningBuildDto {
    pub display_name: String,
    pub job_full_name: String,
    pub number: i64,
    pub url: String,
    pub node_name: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsExecutorStatusDto {
    pub busy: i32,
    pub total: i32,
    pub running: Vec<JenkinsRunningBuildDto>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsQueueItemDto {
    pub id: i64,
    pub task_name: String,
    pub task_full_name: String,
    pub task_url: String,
    pub why: String,
    pub stuck: bool,
    pub blocked: bool,
    pub buildable: bool,
    pub pending: bool,
    pub in_queue_since: Option<i64>,
    pub params: String,
    pub causes: String,
    pub url: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsActivitySnapshotDto {
    pub queue: Vec<JenkinsQueueItemDto>,
    pub executors: JenkinsExecutorStatusDto,
    pub fingerprint: String,
}

#[derive(Debug, Deserialize)]
struct RootApi {
    mode: Option<String>,
    jobs: Option<Vec<JobNode>>,
}

#[derive(Debug, Deserialize)]
struct JobNode {
    name: String,
    url: Option<String>,
    #[serde(rename = "_class")]
    class_name: Option<String>,
    color: Option<String>,
    jobs: Option<Vec<JobNode>>,
    #[serde(rename = "lastBuild")]
    last_build: Option<BuildNode>,
    #[serde(rename = "lastSuccessfulBuild")]
    last_successful_build: Option<BuildNode>,
    #[serde(rename = "lastFailedBuild")]
    last_failed_build: Option<BuildNode>,
}

#[derive(Debug, Deserialize)]
struct BuildNode {
    number: Option<i64>,
    result: Option<String>,
    timestamp: Option<i64>,
    duration: Option<i64>,
    building: Option<bool>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JobBuildsApi {
    builds: Option<Vec<BuildNode>>,
}

#[derive(Debug, Deserialize)]
struct JobDetailRaw {
    name: Option<String>,
    url: Option<String>,
    buildable: Option<bool>,
    #[serde(rename = "_class")]
    class_name: Option<String>,
    property: Option<Vec<JobPropertyRaw>>,
}

#[derive(Debug, Deserialize)]
struct JobPropertyRaw {
    #[serde(rename = "parameterDefinitions")]
    parameter_definitions: Option<Vec<ParameterDefRaw>>,
}

#[derive(Debug, Deserialize)]
struct ParameterDefRaw {
    name: Option<String>,
    #[serde(rename = "type")]
    param_type: Option<String>,
    #[serde(rename = "defaultParameterValue")]
    default_parameter_value: Option<DefaultValueRaw>,
    choices: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct DefaultValueRaw {
    value: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct BuildDetailRaw {
    number: Option<i64>,
    result: Option<String>,
    timestamp: Option<i64>,
    duration: Option<i64>,
    #[serde(rename = "estimatedDuration")]
    estimated_duration: Option<i64>,
    building: Option<bool>,
    url: Option<String>,
    #[serde(rename = "builtOn")]
    built_on: Option<String>,
    actions: Option<Vec<BuildActionRaw>>,
    #[serde(rename = "changeSet")]
    change_set: Option<ChangeSetRaw>,
    #[serde(rename = "changeSets")]
    change_sets: Option<Vec<ChangeSetRaw>>,
}

#[derive(Debug, Deserialize)]
struct ChangeSetRaw {
    items: Option<Vec<ChangeItemRaw>>,
}

#[derive(Debug, Deserialize)]
struct ChangeItemRaw {
    #[serde(rename = "commitId")]
    commit_id: Option<String>,
    msg: Option<String>,
    author: Option<ChangeAuthorRaw>,
}

#[derive(Debug, Deserialize)]
struct ChangeAuthorRaw {
    #[serde(rename = "fullName")]
    full_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BuildActionRaw {
    causes: Option<Vec<CauseRaw>>,
}

#[derive(Debug, Deserialize)]
struct CauseRaw {
    #[serde(rename = "shortDescription")]
    short_description: Option<String>,
    #[serde(rename = "userName")]
    user_name: Option<String>,
    #[serde(rename = "userId")]
    user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ComputerApi {
    computer: Option<Vec<ComputerNode>>,
}

#[derive(Debug, Deserialize)]
struct ComputerNode {
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    offline: Option<bool>,
    #[serde(rename = "numExecutors")]
    num_executors: Option<i32>,
    executors: Option<Vec<Option<ExecutorSlot>>>,
}

#[derive(Debug, Deserialize)]
struct ExecutorSlot {
    #[serde(rename = "currentExecutable")]
    current_executable: Option<serde_json::Value>,
    idle: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct QueueApi {
    items: Option<Vec<QueueItemRaw>>,
}

#[derive(Debug, Deserialize)]
struct QueueItemRaw {
    id: Option<i64>,
    stuck: Option<bool>,
    blocked: Option<bool>,
    buildable: Option<bool>,
    pending: Option<bool>,
    why: Option<String>,
    #[serde(rename = "inQueueSince")]
    in_queue_since: Option<i64>,
    params: Option<String>,
    url: Option<String>,
    task: Option<QueueTaskRaw>,
    actions: Option<Vec<QueueActionRaw>>,
}

#[derive(Debug, Deserialize)]
struct QueueTaskRaw {
    name: Option<String>,
    url: Option<String>,
    #[serde(rename = "fullName")]
    full_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QueueActionRaw {
    causes: Option<Vec<CauseRaw>>,
}

#[derive(Debug, Deserialize)]
struct CrumbApi {
    crumb: String,
    #[serde(rename = "crumbRequestField")]
    crumb_request_field: String,
}

impl JenkinsClient {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn connect(
        &self,
        config_path: Option<String>,
    ) -> Result<JenkinsConnectResultDto, AppError> {
        let path = resolve_config_path(config_path);
        let raw = tokio::fs::read_to_string(&path).await.map_err(|err| {
            AppError::coded(
                "JENKINS_CONFIG_INVALID",
                format!("cannot read Jenkins config: {}", path.display()),
                Some(err.to_string()),
                false,
            )
        })?;
        let cfg: JenkinsConfigFile = serde_json::from_str(&raw).map_err(|err| {
            AppError::coded(
                "JENKINS_CONFIG_INVALID",
                "Jenkins config JSON is invalid",
                Some(err.to_string()),
                false,
            )
        })?;
        let base_url = cfg.base_url.trim().trim_end_matches('/').to_string();
        if base_url.is_empty() || cfg.username.trim().is_empty() || cfg.api_token.trim().is_empty()
        {
            return Err(AppError::coded(
                "JENKINS_CONFIG_INVALID",
                "baseUrl, username, and apiToken are required",
                None,
                false,
            ));
        }

        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .no_proxy()
            .cookie_store(true)
            .build()
            .map_err(|err| {
                AppError::coded(
                    "JENKINS_HTTP_ERROR",
                    "failed to create HTTP client",
                    Some(err.to_string()),
                    false,
                )
            })?;

        let webhook_file = cfg.webhook.clone().unwrap_or(JenkinsWebhookFileConfig {
            enabled: None,
            port: None,
            token: None,
        });
        let webhook = JenkinsWebhookRuntime {
            enabled: webhook_file.enabled.unwrap_or(true),
            port: webhook_file.port.unwrap_or(18765),
            token: webhook_file.token.filter(|s| !s.trim().is_empty()),
        };
        let webhook_url = if webhook.enabled {
            format!("http://127.0.0.1:{}/jenkins/webhook", webhook.port)
        } else {
            String::new()
        };

        let session = JenkinsSession {
            base_url: base_url.clone(),
            username: cfg.username.trim().to_string(),
            api_token: cfg.api_token.trim().to_string(),
            http,
            webhook: webhook.clone(),
        };

        let root: RootApi = session.get_json("api/json?tree=mode").await?;
        let mode = root.mode.unwrap_or_else(|| "UNKNOWN".into());
        *self.inner.write().await = Some(session);

        info!(
            target: "lancer::jenkins",
            base_url = %base_url,
            username = %cfg.username,
            webhook_enabled = webhook.enabled,
            webhook_port = webhook.port,
            "jenkins connected"
        );

        Ok(JenkinsConnectResultDto {
            base_url,
            username: cfg.username.trim().to_string(),
            mode,
            webhook_enabled: webhook.enabled,
            webhook_url,
        })
    }

    pub async fn webhook_listen_config(&self) -> Option<super::JenkinsWebhookListenConfig> {
        let guard = self.inner.read().await;
        let session = guard.as_ref()?;
        Some(super::JenkinsWebhookListenConfig {
            enabled: session.webhook.enabled,
            port: session.webhook.port,
            token: session.webhook.token.clone(),
        })
    }

    pub async fn disconnect(&self) {
        *self.inner.write().await = None;
    }

    pub async fn status(&self) -> JenkinsStatusDto {
        let guard = self.inner.read().await;
        match guard.as_ref() {
            Some(s) => JenkinsStatusDto {
                connected: true,
                base_url: s.base_url.clone(),
                username: s.username.clone(),
                webhook_enabled: s.webhook.enabled,
                webhook_url: if s.webhook.enabled {
                    format!("http://127.0.0.1:{}/jenkins/webhook", s.webhook.port)
                } else {
                    String::new()
                },
            },
            None => JenkinsStatusDto {
                connected: false,
                base_url: String::new(),
                username: String::new(),
                webhook_enabled: false,
                webhook_url: String::new(),
            },
        }
    }

    pub async fn list_jobs(&self) -> Result<Vec<JenkinsJobSummaryDto>, AppError> {
        let session = self.require_session().await?;
        let tree = "jobs[name,url,_class,color,jobs[name,url,_class,color,lastBuild[number,result,timestamp,duration,building,url],lastSuccessfulBuild[number,timestamp],lastFailedBuild[number,timestamp]],lastBuild[number,result,timestamp,duration,building,url],lastSuccessfulBuild[number,timestamp],lastFailedBuild[number,timestamp]]";
        let root: RootApi = session
            .get_json(&format!("api/json?tree={}", urlencoding::encode(tree)))
            .await?;

        let mut out = Vec::new();
        for node in root.jobs.unwrap_or_default() {
            flatten_jobs(&mut out, "", &node);
        }
        out.sort_by(|a, b| a.full_name.cmp(&b.full_name));
        Ok(out)
    }

    pub async fn list_builds(
        &self,
        job_full_name: &str,
        limit: usize,
    ) -> Result<Vec<JenkinsBuildSummaryDto>, AppError> {
        let session = self.require_session().await?;
        let name = require_job_name(job_full_name)?;
        let path = job_api_path(name);
        let tree = "builds[number,result,timestamp,duration,building,url]";
        let detail: JobBuildsApi = session
            .get_json(&format!(
                "{path}/api/json?tree={}",
                urlencoding::encode(tree)
            ))
            .await?;

        let lim = limit.clamp(1, 100);
        let mut rows = Vec::new();
        for b in detail.builds.unwrap_or_default().into_iter().take(lim) {
            let number = b.number.unwrap_or(0);
            rows.push(JenkinsBuildSummaryDto {
                id: format!("{name}#{number}"),
                job_full_name: name.to_string(),
                number,
                result: normalize_result(b.result, b.building.unwrap_or(false)),
                building: b.building.unwrap_or(false),
                timestamp: b.timestamp.unwrap_or(0),
                duration_ms: b.duration.unwrap_or(0),
                url: b.url.unwrap_or_default(),
            });
        }
        Ok(rows)
    }

    pub async fn get_job(&self, job_full_name: &str) -> Result<JenkinsJobDetailDto, AppError> {
        let session = self.require_session().await?;
        self.load_job_detail(&session, job_full_name).await
    }

    pub async fn get_job_config(
        &self,
        job_full_name: &str,
    ) -> Result<JenkinsJobConfigDto, AppError> {
        let session = self.require_session().await?;
        let name = require_job_name(job_full_name)?;
        let path = job_api_path(name);
        let xml = session.get_text(&format!("{path}/config.xml")).await?;
        Ok(JenkinsJobConfigDto {
            job_full_name: name.to_string(),
            xml,
        })
    }

    pub async fn update_job_config(
        &self,
        job_full_name: &str,
        xml: &str,
    ) -> Result<JenkinsJobConfigDto, AppError> {
        let session = self.require_session().await?;
        let name = require_job_name(job_full_name)?;
        let trimmed = xml.trim();
        if trimmed.is_empty() {
            return Err(AppError::coded(
                "JENKINS_BAD_REQUEST",
                "config.xml 不能为空",
                None,
                false,
            ));
        }
        if !trimmed.starts_with('<') {
            return Err(AppError::coded(
                "JENKINS_BAD_REQUEST",
                "config.xml 看起来不是有效 XML",
                None,
                false,
            ));
        }
        let crumb = session.fetch_crumb().await?;
        let path = job_api_path(name);
        session
            .post_xml(&format!("{path}/config.xml"), &crumb, trimmed)
            .await?;
        info!(
            target: "lancer::jenkins",
            job = %name,
            bytes = trimmed.len(),
            "jenkins job config updated"
        );
        Ok(JenkinsJobConfigDto {
            job_full_name: name.to_string(),
            xml: trimmed.to_string(),
        })
    }

    pub async fn build_job(
        &self,
        job_full_name: &str,
        params: HashMap<String, String>,
    ) -> Result<JenkinsBuildTriggerResultDto, AppError> {
        let session = self.require_session().await?;
        let name = require_job_name(job_full_name)?;
        let detail = self.load_job_detail(&session, name).await?;
        if !detail.buildable {
            return Err(AppError::coded(
                "JENKINS_BAD_REQUEST",
                format!("job is not buildable: {name}"),
                None,
                false,
            ));
        }

        let mut final_params: HashMap<String, String> = HashMap::new();
        for p in &detail.parameters {
            let value = params
                .get(&p.name)
                .cloned()
                .unwrap_or_else(|| p.default_value.clone());
            final_params.insert(p.name.clone(), value);
        }
        for (k, v) in params {
            final_params.entry(k).or_insert(v);
        }

        let crumb = session.fetch_crumb().await?;
        let path = job_api_path(name);
        let relative = if detail.parameters.is_empty() {
            format!("{path}/build")
        } else {
            format!("{path}/buildWithParameters")
        };

        let queue_url = session
            .post_form(&relative, &crumb, &final_params)
            .await?;

        info!(
            target: "lancer::jenkins",
            job = %name,
            queue_url = %queue_url,
            "jenkins build triggered"
        );

        Ok(JenkinsBuildTriggerResultDto {
            job_full_name: name.to_string(),
            queue_url,
        })
    }

    pub async fn get_build(
        &self,
        job_full_name: &str,
        number: i64,
    ) -> Result<JenkinsBuildDetailDto, AppError> {
        let session = self.require_session().await?;
        let name = require_job_name(job_full_name)?;
        if number <= 0 {
            return Err(AppError::coded(
                "JENKINS_BAD_REQUEST",
                "build number must be positive",
                None,
                false,
            ));
        }
        let path = job_api_path(name);
        let raw: BuildDetailRaw = session
            .get_json(&format!("{path}/{number}/api/json"))
            .await?;
        Ok(map_build_detail(name, raw))
    }

    pub async fn get_console(
        &self,
        job_full_name: &str,
        number: i64,
        start: i64,
    ) -> Result<JenkinsConsoleChunkDto, AppError> {
        let session = self.require_session().await?;
        let name = require_job_name(job_full_name)?;
        if number <= 0 {
            return Err(AppError::coded(
                "JENKINS_BAD_REQUEST",
                "build number must be positive",
                None,
                false,
            ));
        }
        let path = job_api_path(name);
        let start = start.max(0);
        let relative = format!("{path}/{number}/logText/progressiveText?start={start}");
        session.get_progressive_text(&relative).await
    }

    pub async fn stop_build(
        &self,
        job_full_name: &str,
        number: i64,
    ) -> Result<(), AppError> {
        let session = self.require_session().await?;
        let name = require_job_name(job_full_name)?;
        if number <= 0 {
            return Err(AppError::coded(
                "JENKINS_BAD_REQUEST",
                "build number must be positive",
                None,
                false,
            ));
        }
        let crumb = session.fetch_crumb().await?;
        let path = job_api_path(name);
        session
            .post_form(&format!("{path}/{number}/stop"), &crumb, &HashMap::new())
            .await?;
        info!(
            target: "lancer::jenkins",
            job = %name,
            number,
            "jenkins build stop requested"
        );
        Ok(())
    }

    pub async fn executor_status(&self) -> Result<JenkinsExecutorStatusDto, AppError> {
        let session = self.require_session().await?;
        let tree = "computer[displayName,offline,numExecutors,executors[idle,currentExecutable[number,url,fullDisplayName,displayName]]]";
        let api: ComputerApi = session
            .get_json(&format!(
                "computer/api/json?tree={}",
                urlencoding::encode(tree)
            ))
            .await?;
        let mut total = 0;
        let mut busy = 0;
        let mut running = Vec::new();
        for node in api.computer.unwrap_or_default() {
            if node.offline.unwrap_or(false) {
                continue;
            }
            let node_name = node
                .display_name
                .clone()
                .unwrap_or_else(|| "unknown".to_string());
            let n = node.num_executors.unwrap_or(0);
            total += n;
            if let Some(executors) = node.executors {
                for slot in executors.into_iter().flatten() {
                    let idle = slot.idle.unwrap_or(slot.current_executable.is_none());
                    if !idle {
                        busy += 1;
                    }
                    if let Some(exec) = slot.current_executable.as_ref() {
                        if let Some(row) = parse_running_build(exec, &node_name) {
                            running.push(row);
                        }
                    }
                }
            }
        }
        Ok(JenkinsExecutorStatusDto {
            busy,
            total,
            running,
        })
    }

    pub async fn list_queue(&self) -> Result<Vec<JenkinsQueueItemDto>, AppError> {
        let session = self.require_session().await?;
        let tree = "items[id,blocked,buildable,stuck,pending,why,inQueueSince,params,url,task[name,url,fullName],actions[causes[shortDescription]]]";
        let api: QueueApi = session
            .get_json(&format!(
                "queue/api/json?tree={}",
                urlencoding::encode(tree)
            ))
            .await?;
        let mut rows = Vec::new();
        for item in api.items.unwrap_or_default() {
            rows.push(map_queue_item(item));
        }
        Ok(rows)
    }

    pub async fn activity_snapshot(&self) -> Result<JenkinsActivitySnapshotDto, AppError> {
        let queue = self.list_queue().await?;
        let executors = self.executor_status().await?;
        let fingerprint = activity_fingerprint(&queue, &executors);
        Ok(JenkinsActivitySnapshotDto {
            queue,
            executors,
            fingerprint,
        })
    }

    pub async fn cancel_queue_item(&self, id: i64) -> Result<(), AppError> {
        let session = self.require_session().await?;
        if id <= 0 {
            return Err(AppError::coded(
                "JENKINS_BAD_REQUEST",
                "queue item id must be positive",
                None,
                false,
            ));
        }
        let crumb = session.fetch_crumb().await?;
        session
            .post_form(
                &format!("queue/cancelItem?id={id}"),
                &crumb,
                &HashMap::new(),
            )
            .await?;
        Ok(())
    }

    async fn load_job_detail(
        &self,
        session: &JenkinsSession,
        job_full_name: &str,
    ) -> Result<JenkinsJobDetailDto, AppError> {
        let name = require_job_name(job_full_name)?;
        let path = job_api_path(name);
        // Full JSON (not tree) — Active Choices plugins often break restrictive trees.
        let raw: JobDetailRaw = session.get_json(&format!("{path}/api/json")).await?;
        let mut parameters = Vec::new();
        for prop in raw.property.unwrap_or_default() {
            for def in prop.parameter_definitions.unwrap_or_default() {
                let pname = def.name.unwrap_or_default();
                if pname.is_empty() {
                    continue;
                }
                let default_value = def
                    .default_parameter_value
                    .and_then(|d| d.value)
                    .map(json_value_to_string)
                    .unwrap_or_default();
                let choices = def
                    .choices
                    .unwrap_or_default()
                    .into_iter()
                    .map(json_value_to_string)
                    .filter(|s| !s.is_empty())
                    .collect();
                parameters.push(JenkinsParameterDto {
                    name: pname,
                    param_type: def.param_type.unwrap_or_default(),
                    default_value,
                    choices,
                });
            }
        }

        Ok(JenkinsJobDetailDto {
            full_name: name.to_string(),
            name: raw.name.unwrap_or_else(|| {
                name.rsplit('/').next().unwrap_or(name).to_string()
            }),
            buildable: raw.buildable.unwrap_or(true),
            url: raw.url.unwrap_or_default(),
            class_name: raw.class_name.unwrap_or_default(),
            parameters,
        })
    }

    async fn require_session(&self) -> Result<JenkinsSession, AppError> {
        self.inner.read().await.clone().ok_or_else(|| {
            AppError::coded(
                "JENKINS_NOT_CONNECTED",
                "Jenkins is not connected",
                None,
                false,
            )
        })
    }
}

struct CrumbHeader {
    field: String,
    value: String,
}

impl JenkinsSession {
    async fn get_json<T: for<'de> Deserialize<'de>>(&self, relative: &str) -> Result<T, AppError> {
        let url = format!("{}/{}", self.base_url, relative.trim_start_matches('/'));
        let response = self
            .http
            .get(&url)
            .basic_auth(&self.username, Some(&self.api_token))
            .send()
            .await
            .map_err(map_http_send_err)?;

        map_http_response(response).await?.json::<T>().await.map_err(|err| {
            AppError::coded(
                "JENKINS_HTTP_ERROR",
                "failed to parse Jenkins JSON",
                Some(err.to_string()),
                true,
            )
        })
    }

    async fn get_text(&self, relative: &str) -> Result<String, AppError> {
        let url = format!("{}/{}", self.base_url, relative.trim_start_matches('/'));
        let response = self
            .http
            .get(&url)
            .basic_auth(&self.username, Some(&self.api_token))
            .send()
            .await
            .map_err(map_http_send_err)?;
        let response = map_http_response(response).await?;
        response.text().await.map_err(|err| {
            AppError::coded(
                "JENKINS_HTTP_ERROR",
                "failed to read Jenkins response body",
                Some(err.to_string()),
                true,
            )
        })
    }

    async fn fetch_crumb(&self) -> Result<CrumbHeader, AppError> {
        let crumb: CrumbApi = self.get_json("crumbIssuer/api/json").await?;
        Ok(CrumbHeader {
            field: crumb.crumb_request_field,
            value: crumb.crumb,
        })
    }

    async fn get_progressive_text(&self, relative: &str) -> Result<JenkinsConsoleChunkDto, AppError> {
        let url = format!("{}/{}", self.base_url, relative.trim_start_matches('/'));
        let response = self
            .http
            .get(&url)
            .basic_auth(&self.username, Some(&self.api_token))
            .send()
            .await
            .map_err(map_http_send_err)?;

        let status = response.status();
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(AppError::coded(
                "JENKINS_AUTH_FAILED",
                "Jenkins authentication failed",
                Some(format!("HTTP {status}")),
                false,
            ));
        }
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::coded(
                "JENKINS_HTTP_ERROR",
                format!("Jenkins returned HTTP {status}"),
                Some(body.chars().take(400).collect()),
                status.is_server_error(),
            ));
        }

        let next_start = response
            .headers()
            .get("X-Text-Size")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        let more_data = response
            .headers()
            .get("X-More-Data")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        let text = response.text().await.unwrap_or_default();
        Ok(JenkinsConsoleChunkDto {
            text,
            next_start,
            more_data,
        })
    }

    async fn post_form(
        &self,
        relative: &str,
        crumb: &CrumbHeader,
        params: &HashMap<String, String>,
    ) -> Result<String, AppError> {
        let url = format!("{}/{}", self.base_url, relative.trim_start_matches('/'));
        let mut form = params.clone();
        // Some Jenkins setups also accept crumb as form field.
        form.insert(crumb.field.clone(), crumb.value.clone());

        let response = self
            .http
            .post(&url)
            .basic_auth(&self.username, Some(&self.api_token))
            .header(&crumb.field, &crumb.value)
            .form(&form)
            .send()
            .await
            .map_err(map_http_send_err)?;

        let status = response.status();
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        // 201 Created / 302 Found are success for build triggers.
        if status == StatusCode::CREATED
            || status == StatusCode::FOUND
            || status == StatusCode::SEE_OTHER
            || status.is_success()
        {
            return Ok(if location.is_empty() {
                url
            } else {
                location
            });
        }

        let body = response.text().await.unwrap_or_default();
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(AppError::coded(
                "JENKINS_AUTH_FAILED",
                "Jenkins authentication failed",
                Some(format!("HTTP {status}")),
                false,
            ));
        }
        Err(AppError::coded(
            "JENKINS_HTTP_ERROR",
            format!("Jenkins build trigger failed: HTTP {status}"),
            Some(body.chars().take(400).collect()),
            status.is_server_error(),
        ))
    }

    async fn post_xml(
        &self,
        relative: &str,
        crumb: &CrumbHeader,
        xml: &str,
    ) -> Result<(), AppError> {
        let url = format!("{}/{}", self.base_url, relative.trim_start_matches('/'));
        let response = self
            .http
            .post(&url)
            .basic_auth(&self.username, Some(&self.api_token))
            .header(&crumb.field, &crumb.value)
            .header(reqwest::header::CONTENT_TYPE, "application/xml; charset=utf-8")
            .body(xml.to_string())
            .send()
            .await
            .map_err(map_http_send_err)?;

        let status = response.status();
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::coded(
                "JENKINS_AUTH_FAILED",
                "Jenkins authentication failed（可能无 Job 配置写权限）",
                Some(format!("HTTP {status}; {}", body.chars().take(200).collect::<String>())),
                false,
            ));
        }
        if status.is_success()
            || status == StatusCode::CREATED
            || status == StatusCode::FOUND
            || status == StatusCode::SEE_OTHER
        {
            return Ok(());
        }
        let body = response.text().await.unwrap_or_default();
        Err(AppError::coded(
            "JENKINS_HTTP_ERROR",
            format!("保存 Job 配置失败: HTTP {status}"),
            Some(body.chars().take(500).collect()),
            status.is_server_error(),
        ))
    }
}

async fn map_http_response(response: reqwest::Response) -> Result<reqwest::Response, AppError> {
    let status = response.status();
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Err(AppError::coded(
            "JENKINS_AUTH_FAILED",
            "Jenkins authentication failed",
            Some(format!("HTTP {status}")),
            false,
        ));
    }
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::coded(
            "JENKINS_HTTP_ERROR",
            format!("Jenkins returned HTTP {status}"),
            Some(body.chars().take(400).collect()),
            status.is_server_error(),
        ));
    }
    Ok(response)
}

fn map_http_send_err(err: reqwest::Error) -> AppError {
    AppError::coded(
        "JENKINS_UNREACHABLE",
        "Jenkins HTTP request failed",
        Some(err.to_string()),
        true,
    )
}

fn flatten_jobs(out: &mut Vec<JenkinsJobSummaryDto>, folder: &str, node: &JobNode) {
    let class_name = node.class_name.clone().unwrap_or_default();
    let is_folder = class_name.contains("Folder");
    let full_name = if folder.is_empty() {
        node.name.clone()
    } else {
        format!("{folder}/{}", node.name)
    };

    if is_folder {
        if let Some(children) = &node.jobs {
            for child in children {
                flatten_jobs(out, &full_name, child);
            }
        }
        return;
    }

    let last = node.last_build.as_ref();
    let building = last.and_then(|b| b.building).unwrap_or(false)
        || node
            .color
            .as_deref()
            .is_some_and(|c| c.ends_with("_anime"));
    let last_ok = node.last_successful_build.as_ref();
    let last_fail = node.last_failed_build.as_ref();
    out.push(JenkinsJobSummaryDto {
        full_name: full_name.clone(),
        name: node.name.clone(),
        folder: folder.to_string(),
        url: node.url.clone().unwrap_or_default(),
        class_name,
        color: node.color.clone().unwrap_or_default(),
        building,
        last_build_number: last.and_then(|b| b.number),
        last_build_result: normalize_result(last.and_then(|b| b.result.clone()), building),
        last_build_timestamp: last.and_then(|b| b.timestamp),
        last_build_duration_ms: last.and_then(|b| b.duration),
        last_successful_number: last_ok.and_then(|b| b.number),
        last_successful_timestamp: last_ok.and_then(|b| b.timestamp),
        last_failed_number: last_fail.and_then(|b| b.number),
        last_failed_timestamp: last_fail.and_then(|b| b.timestamp),
    });
}

fn map_build_detail(job_full_name: &str, raw: BuildDetailRaw) -> JenkinsBuildDetailDto {
    let number = raw.number.unwrap_or(0);
    let building = raw.building.unwrap_or(false);
    let mut cause = String::new();
    for action in raw.actions.unwrap_or_default() {
        for c in action.causes.unwrap_or_default() {
            if let Some(desc) = c.short_description.filter(|s| !s.is_empty()) {
                cause = desc;
                break;
            }
            if let Some(user) = c.user_name.or(c.user_id).filter(|s| !s.is_empty()) {
                cause = format!("Started by user {user}");
                break;
            }
        }
        if !cause.is_empty() {
            break;
        }
    }
    let mut changes = Vec::new();
    let mut sets = Vec::new();
    if let Some(cs) = raw.change_set {
        sets.push(cs);
    }
    if let Some(more) = raw.change_sets {
        sets.extend(more);
    }
    for set in sets {
        for item in set.items.unwrap_or_default() {
            let message = item.msg.unwrap_or_default();
            if message.is_empty() && item.commit_id.as_deref().unwrap_or("").is_empty() {
                continue;
            }
            changes.push(JenkinsChangeItemDto {
                commit_id: item.commit_id.unwrap_or_default(),
                author: item
                    .author
                    .and_then(|a| a.full_name)
                    .unwrap_or_default(),
                message,
            });
        }
    }

    JenkinsBuildDetailDto {
        id: format!("{job_full_name}#{number}"),
        job_full_name: job_full_name.to_string(),
        number,
        result: normalize_result(raw.result, building),
        building,
        timestamp: raw.timestamp.unwrap_or(0),
        duration_ms: raw.duration.unwrap_or(0),
        estimated_duration_ms: raw.estimated_duration.unwrap_or(0),
        url: raw.url.unwrap_or_default(),
        built_on: raw.built_on.unwrap_or_default(),
        cause,
        changes,
    }
}

fn job_api_path(full_name: &str) -> String {
    full_name
        .split('/')
        .filter(|s| !s.is_empty())
        .map(|seg| format!("job/{}", urlencoding::encode(seg)))
        .collect::<Vec<_>>()
        .join("/")
}

fn require_job_name(job_full_name: &str) -> Result<&str, AppError> {
    let name = job_full_name.trim().trim_matches('/');
    if name.is_empty() {
        return Err(AppError::coded(
            "JENKINS_BAD_REQUEST",
            "job fullName is required",
            None,
            false,
        ));
    }
    Ok(name)
}

fn normalize_result(result: Option<String>, building: bool) -> String {
    if building {
        return "RUNNING".into();
    }
    match result.as_deref() {
        Some("") | None => "NOT_BUILT".into(),
        Some(r) => r.to_string(),
    }
}

fn map_queue_item(item: QueueItemRaw) -> JenkinsQueueItemDto {
    let task = item.task.unwrap_or(QueueTaskRaw {
        name: None,
        url: None,
        full_name: None,
    });
    let task_url = task.url.unwrap_or_default();
    let item_url = item.url.unwrap_or_default();
    let from_url = job_full_name_from_url(&task_url);
    let task_full_name = task
        .full_name
        .filter(|s| !s.is_empty())
        .or_else(|| {
            if from_url.is_empty() {
                None
            } else {
                Some(from_url.clone())
            }
        })
        .unwrap_or_default();
    let task_name = task
        .name
        .filter(|s| !s.is_empty())
        .or_else(|| {
            task_full_name
                .rsplit('/')
                .next()
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_else(|| {
            if task_full_name.is_empty() {
                format!("queue #{}", item.id.unwrap_or(0))
            } else {
                task_full_name.clone()
            }
        });
    let mut causes = String::new();
    for action in item.actions.unwrap_or_default() {
        for c in action.causes.unwrap_or_default() {
            if let Some(desc) = c.short_description.filter(|s| !s.is_empty()) {
                causes = desc;
                break;
            }
        }
        if !causes.is_empty() {
            break;
        }
    }
    JenkinsQueueItemDto {
        id: item.id.unwrap_or(0),
        task_name,
        task_full_name,
        task_url,
        why: item.why.unwrap_or_default(),
        stuck: item.stuck.unwrap_or(false),
        blocked: item.blocked.unwrap_or(false),
        buildable: item.buildable.unwrap_or(false),
        pending: item.pending.unwrap_or(false),
        in_queue_since: item.in_queue_since,
        params: item.params.unwrap_or_default(),
        causes,
        url: item_url,
    }
}

fn parse_running_build(value: &serde_json::Value, node_name: &str) -> Option<JenkinsRunningBuildDto> {
    let number = value.get("number")?.as_i64()?;
    let url = value
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let display_name = value
        .get("fullDisplayName")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("displayName").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();
    let job_full_name = job_full_name_from_url(&url);
    let display_name = if display_name.is_empty() {
        if job_full_name.is_empty() {
            format!("#{number}")
        } else {
            format!("{job_full_name} #{number}")
        }
    } else {
        display_name
    };
    Some(JenkinsRunningBuildDto {
        display_name,
        job_full_name,
        number,
        url,
        node_name: node_name.to_string(),
    })
}

fn job_full_name_from_url(url: &str) -> String {
    let mut parts = Vec::new();
    let mut rest = url;
    while let Some(idx) = rest.find("/job/") {
        rest = &rest[idx + 5..];
        let end = rest.find('/').unwrap_or(rest.len());
        let seg = &rest[..end];
        if !seg.is_empty() && seg != ".." {
            let decoded = urlencoding::decode(seg)
                .map(|c| c.into_owned())
                .unwrap_or_else(|_| seg.to_string());
            parts.push(decoded);
        }
        rest = &rest[end..];
    }
    parts.join("/")
}

fn activity_fingerprint(
    queue: &[JenkinsQueueItemDto],
    executors: &JenkinsExecutorStatusDto,
) -> String {
    let mut parts = Vec::with_capacity(queue.len() + executors.running.len() + 1);
    parts.push(format!("e:{}:{}", executors.busy, executors.total));
    for q in queue {
        parts.push(format!(
            "q:{}:{}:{}:{}",
            q.id,
            q.stuck as u8,
            q.blocked as u8,
            q.why
        ));
    }
    for r in &executors.running {
        parts.push(format!(
            "r:{}:{}:{}",
            r.job_full_name, r.number, r.node_name
        ));
    }
    parts.join("|")
}

fn json_value_to_string(v: serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s,
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::Null => String::new(),
        other => other.to_string(),
    }
}

pub fn default_jenkins_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".lancer")
        .join("jenkins.json")
}

fn resolve_config_path(config_path: Option<String>) -> PathBuf {
    config_path
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(default_jenkins_config_path)
}
