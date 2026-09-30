use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::credentials::{
    ImportKubeconfigResultDto, JenkinsLocalConfigDto, KubeCredentialStatusDto, KubeconfigYamlDto,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportKubeconfigInput {
    pub yaml: String,
    pub preferred_context: Option<String>,
    pub default_namespace: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetKubePreferredContextInput {
    pub context: String,
    pub default_namespace: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveJenkinsLocalConfigInput {
    pub base_url: String,
    pub username: String,
    /// Empty keeps the previously stored token.
    pub api_token: Option<String>,
    pub webhook_enabled: Option<bool>,
    pub webhook_port: Option<u16>,
    /// None = keep existing; Some("") = clear.
    pub webhook_token: Option<String>,
}

#[tauri::command]
pub async fn credentials_import_kubeconfig(
    services: State<'_, AppServices>,
    input: ImportKubeconfigInput,
) -> Result<ImportKubeconfigResultDto, AppErrorDto> {
    services
        .credentials_import_kubeconfig(
            input.yaml,
            input.preferred_context,
            input.default_namespace,
        )
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn credentials_get_kube_status(
    services: State<'_, AppServices>,
) -> Result<KubeCredentialStatusDto, AppErrorDto> {
    services
        .credentials_get_kube_status()
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn credentials_get_kubeconfig_yaml(
    services: State<'_, AppServices>,
) -> Result<KubeconfigYamlDto, AppErrorDto> {
    services
        .credentials_get_kubeconfig_yaml()
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn credentials_set_kube_context(
    services: State<'_, AppServices>,
    input: SetKubePreferredContextInput,
) -> Result<KubeCredentialStatusDto, AppErrorDto> {
    services
        .credentials_set_kube_context(input.context, input.default_namespace)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn credentials_get_jenkins_config(
    services: State<'_, AppServices>,
) -> Result<JenkinsLocalConfigDto, AppErrorDto> {
    services
        .credentials_get_jenkins_config()
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn credentials_save_jenkins_config(
    services: State<'_, AppServices>,
    input: SaveJenkinsLocalConfigInput,
) -> Result<JenkinsLocalConfigDto, AppErrorDto> {
    services
        .credentials_save_jenkins_config(
            input.base_url,
            input.username,
            input.api_token.unwrap_or_default(),
            input.webhook_enabled.unwrap_or(true),
            input.webhook_port.unwrap_or(18765),
            input.webhook_token,
        )
        .await
        .map_err(AppErrorDto::from)
}
