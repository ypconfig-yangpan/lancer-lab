use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListNamespacesRequest {
    pub cluster_id: String,
}

#[tauri::command]
pub async fn list_namespaces(
    services: State<'_, AppServices>,
    input: ListNamespacesRequest,
) -> Result<Vec<String>, AppErrorDto> {
    services
        .list_namespaces(input.cluster_id)
        .await
        .map_err(AppErrorDto::from)
}
