use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::kubernetes::{
    DeleteDeploymentResultDto, DeploymentSummaryDto, RestartDeploymentResultDto,
    ScaleDeploymentResultDto, UpdateDeploymentImageResultDto,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDeploymentsRequest {
    pub cluster_id: String,
    pub namespace: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleDeploymentRequest {
    pub cluster_id: String,
    pub namespace: String,
    pub name: String,
    pub replicas: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestartDeploymentRequest {
    pub cluster_id: String,
    pub namespace: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeploymentImageRequest {
    pub cluster_id: String,
    pub namespace: String,
    pub name: String,
    pub image: String,
    pub container: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDeploymentRequest {
    pub cluster_id: String,
    pub namespace: String,
    pub name: String,
}

#[tauri::command]
pub async fn list_deployments(
    services: State<'_, AppServices>,
    input: ListDeploymentsRequest,
) -> Result<Vec<DeploymentSummaryDto>, AppErrorDto> {
    services
        .list_deployments(input.cluster_id, input.namespace)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn scale_deployment(
    services: State<'_, AppServices>,
    input: ScaleDeploymentRequest,
) -> Result<ScaleDeploymentResultDto, AppErrorDto> {
    services
        .scale_deployment(input.cluster_id, input.namespace, input.name, input.replicas)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn restart_deployment(
    services: State<'_, AppServices>,
    input: RestartDeploymentRequest,
) -> Result<RestartDeploymentResultDto, AppErrorDto> {
    services
        .restart_deployment(input.cluster_id, input.namespace, input.name)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn update_deployment_image(
    services: State<'_, AppServices>,
    input: UpdateDeploymentImageRequest,
) -> Result<UpdateDeploymentImageResultDto, AppErrorDto> {
    services
        .update_deployment_image(
            input.cluster_id,
            input.namespace,
            input.name,
            input.image,
            input.container,
        )
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn delete_deployment(
    services: State<'_, AppServices>,
    input: DeleteDeploymentRequest,
) -> Result<DeleteDeploymentResultDto, AppErrorDto> {
    services
        .delete_deployment(input.cluster_id, input.namespace, input.name)
        .await
        .map_err(AppErrorDto::from)
}
