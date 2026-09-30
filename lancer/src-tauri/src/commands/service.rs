use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::kubernetes::ServiceSummaryDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListServicesRequest {
    pub cluster_id: String,
    pub namespace: String,
}

#[tauri::command]
pub async fn list_services(
    services: State<'_, AppServices>,
    input: ListServicesRequest,
) -> Result<Vec<ServiceSummaryDto>, AppErrorDto> {
    services
        .list_services(input.cluster_id, input.namespace)
        .await
        .map_err(AppErrorDto::from)
}
