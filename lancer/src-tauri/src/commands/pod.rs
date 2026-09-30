use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::kubernetes::PodSummaryDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPodsRequest {
    pub cluster_id: String,
    pub namespace: String,
}

#[tauri::command]
pub async fn list_pods(
    services: State<'_, AppServices>,
    input: ListPodsRequest,
) -> Result<Vec<PodSummaryDto>, AppErrorDto> {
    services
        .list_pods(input.cluster_id, input.namespace)
        .await
        .map_err(AppErrorDto::from)
}
