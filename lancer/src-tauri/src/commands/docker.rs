use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::docker::{
    DockerContainerActionResultDto, DockerContainerDetailDto, DockerContainerSummaryDto,
    DockerExecSessionDto, DockerImageActionResultDto, DockerImageSummaryDto, DockerLogLineDto,
    DockerPingDto, DockerVolumeActionResultDto, DockerVolumeSummaryDto,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDockerContainersRequest {
    pub all: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerLogsRequest {
    pub container_id: String,
    pub tail: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerExecOpenRequest {
    pub container_id: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerExecWriteRequest {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerExecResizeRequest {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerExecCloseRequest {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerIdRequest {
    pub container_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerRemoveContainerRequest {
    pub container_id: String,
    pub force: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageRefRequest {
    pub image: String,
    pub force: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerPullImageRequest {
    pub reference: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerVolumeRefRequest {
    pub name: String,
    pub force: Option<bool>,
}

#[tauri::command]
pub async fn docker_ping(services: State<'_, AppServices>) -> Result<DockerPingDto, AppErrorDto> {
    services.docker_ping().await.map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_list_containers(
    services: State<'_, AppServices>,
    input: Option<ListDockerContainersRequest>,
) -> Result<Vec<DockerContainerSummaryDto>, AppErrorDto> {
    let all = input.and_then(|i| i.all).unwrap_or(true);
    services
        .docker_list_containers(all)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_container_logs(
    services: State<'_, AppServices>,
    input: DockerContainerLogsRequest,
) -> Result<Vec<DockerLogLineDto>, AppErrorDto> {
    services
        .docker_container_logs(input.container_id, input.tail)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_inspect_container(
    services: State<'_, AppServices>,
    input: DockerContainerIdRequest,
) -> Result<DockerContainerDetailDto, AppErrorDto> {
    services
        .docker_inspect_container(input.container_id)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_start_container(
    services: State<'_, AppServices>,
    input: DockerContainerIdRequest,
) -> Result<DockerContainerActionResultDto, AppErrorDto> {
    services
        .docker_start_container(input.container_id)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_stop_container(
    services: State<'_, AppServices>,
    input: DockerContainerIdRequest,
) -> Result<DockerContainerActionResultDto, AppErrorDto> {
    services
        .docker_stop_container(input.container_id)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_restart_container(
    services: State<'_, AppServices>,
    input: DockerContainerIdRequest,
) -> Result<DockerContainerActionResultDto, AppErrorDto> {
    services
        .docker_restart_container(input.container_id)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_remove_container(
    services: State<'_, AppServices>,
    input: DockerRemoveContainerRequest,
) -> Result<DockerContainerActionResultDto, AppErrorDto> {
    services
        .docker_remove_container(input.container_id, input.force.unwrap_or(false))
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_list_images(
    services: State<'_, AppServices>,
) -> Result<Vec<DockerImageSummaryDto>, AppErrorDto> {
    services.docker_list_images().await.map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_remove_image(
    services: State<'_, AppServices>,
    input: DockerImageRefRequest,
) -> Result<DockerImageActionResultDto, AppErrorDto> {
    services
        .docker_remove_image(input.image, input.force.unwrap_or(false))
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_pull_image(
    services: State<'_, AppServices>,
    input: DockerPullImageRequest,
) -> Result<DockerImageActionResultDto, AppErrorDto> {
    services
        .docker_pull_image(input.reference)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_list_volumes(
    services: State<'_, AppServices>,
) -> Result<Vec<DockerVolumeSummaryDto>, AppErrorDto> {
    services.docker_list_volumes().await.map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_remove_volume(
    services: State<'_, AppServices>,
    input: DockerVolumeRefRequest,
) -> Result<DockerVolumeActionResultDto, AppErrorDto> {
    services
        .docker_remove_volume(input.name, input.force.unwrap_or(false))
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_exec_open(
    app: tauri::AppHandle,
    services: State<'_, AppServices>,
    input: DockerExecOpenRequest,
) -> Result<DockerExecSessionDto, AppErrorDto> {
    services
        .docker_exec_open(app, input.container_id, input.cols, input.rows)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_exec_write(
    services: State<'_, AppServices>,
    input: DockerExecWriteRequest,
) -> Result<(), AppErrorDto> {
    services
        .docker_exec_write(input.session_id, input.data)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_exec_resize(
    services: State<'_, AppServices>,
    input: DockerExecResizeRequest,
) -> Result<(), AppErrorDto> {
    services
        .docker_exec_resize(input.session_id, input.cols, input.rows)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn docker_exec_close(
    app: tauri::AppHandle,
    services: State<'_, AppServices>,
    input: DockerExecCloseRequest,
) -> Result<(), AppErrorDto> {
    services
        .docker_exec_close(app, input.session_id)
        .await
        .map_err(AppErrorDto::from)
}
