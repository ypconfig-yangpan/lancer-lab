use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::kubernetes::EventSummaryDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListEventsRequest {
    pub cluster_id: String,
    pub namespace: String,
}

#[tauri::command]
pub async fn list_events(
    services: State<'_, AppServices>,
    input: ListEventsRequest,
) -> Result<Vec<EventSummaryDto>, AppErrorDto> {
    services
        .list_events(input.cluster_id, input.namespace)
        .await
        .map_err(AppErrorDto::from)
}
