use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::kubernetes::ResourceWatchKind;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceWatchRequest {
    pub cluster_id: String,
    pub namespace: String,
    pub kind: ResourceWatchKind,
}

#[tauri::command]
pub async fn start_resource_watch(
    app: tauri::AppHandle,
    services: State<'_, AppServices>,
    input: ResourceWatchRequest,
) -> Result<(), AppErrorDto> {
    services
        .start_resource_watch(
            app,
            input.cluster_id,
            input.namespace,
            input.kind,
        )
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn stop_resource_watch(
    services: State<'_, AppServices>,
    input: ResourceWatchRequest,
) -> Result<(), AppErrorDto> {
    services
        .stop_resource_watch(input.cluster_id, input.namespace, input.kind)
        .await;
    Ok(())
}
