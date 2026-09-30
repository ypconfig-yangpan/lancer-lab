use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::jenkins::{
    JenkinsActivitySnapshotDto, JenkinsBuildDetailDto, JenkinsBuildSummaryDto,
    JenkinsBuildTriggerResultDto, JenkinsConnectResultDto, JenkinsConsoleChunkDto,
    JenkinsExecutorStatusDto, JenkinsJobConfigDto, JenkinsJobDetailDto, JenkinsJobSummaryDto,
    JenkinsQueueItemDto, JenkinsStatusDto,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsConnectInput {
    pub config_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsListBuildsInput {
    pub job_full_name: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsJobNameInput {
    pub job_full_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsUpdateJobConfigInput {
    pub job_full_name: String,
    pub xml: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsBuildJobInput {
    pub job_full_name: String,
    pub parameters: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsBuildRefInput {
    pub job_full_name: String,
    pub number: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsConsoleInput {
    pub job_full_name: String,
    pub number: i64,
    pub start: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsQueueCancelInput {
    pub id: i64,
}

#[tauri::command]
pub async fn jenkins_connect(
    app: tauri::AppHandle,
    services: State<'_, AppServices>,
    input: JenkinsConnectInput,
) -> Result<JenkinsConnectResultDto, AppErrorDto> {
    services
        .jenkins_connect(app, input.config_path)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_disconnect(services: State<'_, AppServices>) -> Result<(), AppErrorDto> {
    services.jenkins_disconnect().await;
    Ok(())
}

#[tauri::command]
pub async fn jenkins_status(
    services: State<'_, AppServices>,
) -> Result<JenkinsStatusDto, AppErrorDto> {
    Ok(services.jenkins_status().await)
}

#[tauri::command]
pub async fn jenkins_list_jobs(
    services: State<'_, AppServices>,
) -> Result<Vec<JenkinsJobSummaryDto>, AppErrorDto> {
    services.jenkins_list_jobs().await.map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_list_builds(
    services: State<'_, AppServices>,
    input: JenkinsListBuildsInput,
) -> Result<Vec<JenkinsBuildSummaryDto>, AppErrorDto> {
    let limit = input.limit.unwrap_or(20) as usize;
    services
        .jenkins_list_builds(input.job_full_name, limit)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_get_job(
    services: State<'_, AppServices>,
    input: JenkinsJobNameInput,
) -> Result<JenkinsJobDetailDto, AppErrorDto> {
    services
        .jenkins_get_job(input.job_full_name)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_get_job_config(
    services: State<'_, AppServices>,
    input: JenkinsJobNameInput,
) -> Result<JenkinsJobConfigDto, AppErrorDto> {
    services
        .jenkins_get_job_config(input.job_full_name)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_update_job_config(
    services: State<'_, AppServices>,
    input: JenkinsUpdateJobConfigInput,
) -> Result<JenkinsJobConfigDto, AppErrorDto> {
    services
        .jenkins_update_job_config(input.job_full_name, input.xml)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_build_job(
    services: State<'_, AppServices>,
    input: JenkinsBuildJobInput,
) -> Result<JenkinsBuildTriggerResultDto, AppErrorDto> {
    services
        .jenkins_build_job(input.job_full_name, input.parameters.unwrap_or_default())
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_get_build(
    services: State<'_, AppServices>,
    input: JenkinsBuildRefInput,
) -> Result<JenkinsBuildDetailDto, AppErrorDto> {
    services
        .jenkins_get_build(input.job_full_name, input.number)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_get_console(
    services: State<'_, AppServices>,
    input: JenkinsConsoleInput,
) -> Result<JenkinsConsoleChunkDto, AppErrorDto> {
    services
        .jenkins_get_console(input.job_full_name, input.number, input.start.unwrap_or(0))
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_stop_build(
    services: State<'_, AppServices>,
    input: JenkinsBuildRefInput,
) -> Result<(), AppErrorDto> {
    services
        .jenkins_stop_build(input.job_full_name, input.number)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_executor_status(
    services: State<'_, AppServices>,
) -> Result<JenkinsExecutorStatusDto, AppErrorDto> {
    services
        .jenkins_executor_status()
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_list_queue(
    services: State<'_, AppServices>,
) -> Result<Vec<JenkinsQueueItemDto>, AppErrorDto> {
    services.jenkins_list_queue().await.map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_cancel_queue_item(
    services: State<'_, AppServices>,
    input: JenkinsQueueCancelInput,
) -> Result<(), AppErrorDto> {
    services
        .jenkins_cancel_queue_item(input.id)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn jenkins_activity_snapshot(
    services: State<'_, AppServices>,
) -> Result<JenkinsActivitySnapshotDto, AppErrorDto> {
    services
        .jenkins_activity_snapshot()
        .await
        .map_err(AppErrorDto::from)
}
