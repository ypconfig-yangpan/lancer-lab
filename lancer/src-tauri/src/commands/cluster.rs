use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::cluster::{ClusterIdentity, KubeContextSummary};
use crate::domain::error::AppErrorDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListKubeContextsRequest {
    pub kubeconfig_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectClusterRequest {
    pub kubeconfig_path: Option<String>,
    pub context: String,
    /// Default true for Phase 1 (writes not shipped); user may opt out later.
    #[serde(default = "default_readonly")]
    pub readonly: bool,
    /// Used for namespaced SSAR (Rancher project tokens).
    pub default_namespace: Option<String>,
}

fn default_readonly() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterIdRequest {
    pub cluster_id: String,
}

#[tauri::command]
pub async fn list_kube_contexts(
    services: State<'_, AppServices>,
    input: ListKubeContextsRequest,
) -> Result<Vec<KubeContextSummary>, AppErrorDto> {
    services
        .list_kube_contexts(input.kubeconfig_path)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn connect_cluster(
    services: State<'_, AppServices>,
    input: ConnectClusterRequest,
) -> Result<ClusterIdentity, AppErrorDto> {
    services
        .connect_cluster(
            input.kubeconfig_path,
            input.context,
            input.readonly,
            input.default_namespace,
        )
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn disconnect_cluster(
    services: State<'_, AppServices>,
    input: ClusterIdRequest,
) -> Result<(), AppErrorDto> {
    services
        .disconnect_cluster(input.cluster_id)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn list_connected_clusters(
    services: State<'_, AppServices>,
) -> Result<Vec<ClusterIdentity>, AppErrorDto> {
    Ok(services.list_connected_clusters().await)
}
