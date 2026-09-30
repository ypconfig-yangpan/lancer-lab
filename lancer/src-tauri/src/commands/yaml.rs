use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::kubernetes::{ManifestResourceKind, ResourceYamlDto};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetResourceYamlRequest {
    pub cluster_id: String,
    pub namespace: String,
    pub kind: ManifestResourceKind,
    pub name: String,
}

#[tauri::command]
pub async fn get_resource_yaml(
    services: State<'_, AppServices>,
    input: GetResourceYamlRequest,
) -> Result<ResourceYamlDto, AppErrorDto> {
    services
        .get_resource_yaml(input.cluster_id, input.namespace, input.kind, input.name)
        .await
        .map_err(AppErrorDto::from)
}
