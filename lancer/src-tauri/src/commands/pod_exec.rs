use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::kubernetes::PodExecSessionDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodExecOpenRequest {
    pub cluster_id: String,
    pub namespace: String,
    pub pod: String,
    pub container: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodExecWriteRequest {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodExecResizeRequest {
    pub session_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PodExecCloseRequest {
    pub session_id: String,
}

#[tauri::command]
pub async fn pod_exec_open(
    app: tauri::AppHandle,
    services: State<'_, AppServices>,
    input: PodExecOpenRequest,
) -> Result<PodExecSessionDto, AppErrorDto> {
    services
        .pod_exec_open(
            app,
            input.cluster_id,
            input.namespace,
            input.pod,
            input.container,
            input.cols,
            input.rows,
        )
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn pod_exec_write(
    services: State<'_, AppServices>,
    input: PodExecWriteRequest,
) -> Result<(), AppErrorDto> {
    services
        .pod_exec_write(input.session_id, input.data)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn pod_exec_resize(
    services: State<'_, AppServices>,
    input: PodExecResizeRequest,
) -> Result<(), AppErrorDto> {
    services
        .pod_exec_resize(input.session_id, input.cols, input.rows)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn pod_exec_close(
    app: tauri::AppHandle,
    services: State<'_, AppServices>,
    input: PodExecCloseRequest,
) -> Result<(), AppErrorDto> {
    services
        .pod_exec_close(app, input.session_id)
        .await
        .map_err(AppErrorDto::from)
}
