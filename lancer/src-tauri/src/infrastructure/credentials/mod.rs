//! Local Lancer credential profiles under `~/.lancer/` (not bundled in the app).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::fs;

use crate::domain::cluster::KubeContextSummary;
use crate::domain::error::AppError;
use crate::infrastructure::kubernetes::ClusterClientRegistry;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ConnectionsFile {
    #[serde(default)]
    kubernetes: Option<KubernetesConnectionPref>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KubernetesConnectionPref {
    kubeconfig_path: String,
    #[serde(default)]
    preferred_context: Option<String>,
    #[serde(default)]
    default_namespace: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KubeCredentialStatusDto {
    pub configured: bool,
    pub path_display: String,
    pub absolute_path: String,
    pub preferred_context: Option<String>,
    pub default_namespace: Option<String>,
    pub contexts: Vec<KubeContextSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KubeconfigYamlDto {
    pub configured: bool,
    pub path_display: String,
    pub yaml: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportKubeconfigResultDto {
    pub path_display: String,
    pub absolute_path: String,
    pub preferred_context: Option<String>,
    pub contexts: Vec<KubeContextSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsLocalConfigDto {
    pub configured: bool,
    pub path_display: String,
    pub base_url: String,
    pub username: String,
    /// True when a non-empty apiToken is stored locally.
    pub api_token_set: bool,
    pub webhook_enabled: bool,
    pub webhook_port: u16,
    pub webhook_token_set: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JenkinsConfigFileRead {
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    api_token: String,
    #[serde(default)]
    webhook: Option<JenkinsWebhookFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JenkinsWebhookFile {
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    port: Option<u16>,
    #[serde(default)]
    token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JenkinsConfigFileWrite {
    base_url: String,
    username: String,
    api_token: String,
    webhook: JenkinsWebhookFile,
}

pub fn lancer_home() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".lancer")
}

pub fn default_kubeconfig_store_path() -> PathBuf {
    lancer_home().join("kubeconfigs").join("default.yaml")
}

pub fn connections_file_path() -> PathBuf {
    lancer_home().join("connections.json")
}

pub fn jenkins_config_path() -> PathBuf {
    lancer_home().join("jenkins.json")
}

fn display_home_path(path: &Path) -> String {
    if let Some(home) = dirs::home_dir() {
        if let Ok(stripped) = path.strip_prefix(&home) {
            return format!("~/{}", stripped.display());
        }
    }
    path.display().to_string()
}

async fn ensure_dir(path: &Path) -> Result<(), AppError> {
    fs::create_dir_all(path).await.map_err(|err| {
        AppError::coded(
            "CREDENTIAL_STORE_ERROR",
            format!("cannot create directory: {}", path.display()),
            Some(err.to_string()),
            true,
        )
    })
}

async fn read_connections() -> ConnectionsFile {
    let path = connections_file_path();
    let Ok(raw) = fs::read_to_string(&path).await else {
        return ConnectionsFile::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

async fn write_connections(file: &ConnectionsFile) -> Result<(), AppError> {
    let home = lancer_home();
    ensure_dir(&home).await?;
    let path = connections_file_path();
    let raw = serde_json::to_string_pretty(file).map_err(|err| {
        AppError::coded(
            "CREDENTIAL_STORE_ERROR",
            "failed to serialize connections.json",
            Some(err.to_string()),
            false,
        )
    })?;
    fs::write(&path, raw).await.map_err(|err| {
        AppError::coded(
            "CREDENTIAL_STORE_ERROR",
            format!("cannot write {}", path.display()),
            Some(err.to_string()),
            true,
        )
    })
}

/// Import pasted kubeconfig YAML into `~/.lancer/kubeconfigs/default.yaml`.
pub async fn import_kubeconfig_yaml(
    yaml: String,
    preferred_context: Option<String>,
    default_namespace: Option<String>,
) -> Result<ImportKubeconfigResultDto, AppError> {
    let trimmed = yaml.trim();
    if trimmed.is_empty() {
        return Err(AppError::coded(
            "CLUSTER_CONFIG_INVALID",
            "kubeconfig 内容为空",
            None,
            false,
        ));
    }
    // Basic shape check before write
    if !trimmed.contains("clusters:") || !trimmed.contains("contexts:") {
        return Err(AppError::coded(
            "CLUSTER_CONFIG_INVALID",
            "看起来不是有效的 kubeconfig（缺少 clusters / contexts）",
            None,
            false,
        ));
    }

    let store_dir = lancer_home().join("kubeconfigs");
    ensure_dir(&store_dir).await?;
    let dest = default_kubeconfig_store_path();
    let tmp = store_dir.join("default.yaml.tmp");

    fs::write(&tmp, format!("{trimmed}\n")).await.map_err(|err| {
        AppError::coded(
            "CREDENTIAL_STORE_ERROR",
            "无法写入临时 kubeconfig",
            Some(err.to_string()),
            true,
        )
    })?;

    // Validate by listing contexts
    let contexts = match ClusterClientRegistry::list_contexts(&tmp).await {
        Ok(ctxs) if !ctxs.is_empty() => ctxs,
        Ok(_) => {
            let _ = fs::remove_file(&tmp).await;
            return Err(AppError::coded(
                "CLUSTER_CONFIG_INVALID",
                "kubeconfig 里没有可用的 context",
                None,
                false,
            ));
        }
        Err(err) => {
            let _ = fs::remove_file(&tmp).await;
            return Err(err);
        }
    };

    fs::rename(&tmp, &dest).await.map_err(|err| {
        AppError::coded(
            "CREDENTIAL_STORE_ERROR",
            format!("无法保存 kubeconfig 到 {}", dest.display()),
            Some(err.to_string()),
            true,
        )
    })?;

    let preferred = preferred_context
        .filter(|c| contexts.iter().any(|x| x.name == *c))
        .or_else(|| contexts.iter().find(|c| c.is_current).map(|c| c.name.clone()))
        .or_else(|| contexts.first().map(|c| c.name.clone()));

    let mut file = read_connections().await;
    file.kubernetes = Some(KubernetesConnectionPref {
        kubeconfig_path: dest.display().to_string(),
        preferred_context: preferred.clone(),
        default_namespace: default_namespace.filter(|s| !s.trim().is_empty()),
    });
    write_connections(&file).await?;

    Ok(ImportKubeconfigResultDto {
        path_display: display_home_path(&dest),
        absolute_path: dest.display().to_string(),
        preferred_context: preferred,
        contexts,
    })
}

pub async fn get_kube_credential_status() -> Result<KubeCredentialStatusDto, AppError> {
    let file = read_connections().await;
    let pref = file.kubernetes;
    let path = pref
        .as_ref()
        .map(|p| PathBuf::from(&p.kubeconfig_path))
        .unwrap_or_else(default_kubeconfig_store_path);

    // 即使 connections.json 丢了，只要 default.yaml 在也算已配置
    let path = if path.exists() {
        path
    } else {
        let fallback = default_kubeconfig_store_path();
        if fallback.exists() {
            fallback
        } else {
            return Ok(KubeCredentialStatusDto {
                configured: false,
                path_display: display_home_path(&path),
                absolute_path: path.display().to_string(),
                preferred_context: pref.as_ref().and_then(|p| p.preferred_context.clone()),
                default_namespace: pref.as_ref().and_then(|p| p.default_namespace.clone()),
                contexts: vec![],
            });
        }
    };

    let contexts = match ClusterClientRegistry::list_contexts(&path).await {
        Ok(ctxs) => ctxs,
        Err(err) => {
            // 文件在但解析失败：仍标记 configured，让 UI 展示真实错误而不是「未配置」
            tracing::warn!(
                target: "lancer::credentials",
                path = %path.display(),
                error = %err,
                "list_contexts failed for saved kubeconfig"
            );
            return Ok(KubeCredentialStatusDto {
                configured: true,
                path_display: display_home_path(&path),
                absolute_path: path.display().to_string(),
                preferred_context: pref.as_ref().and_then(|p| p.preferred_context.clone()),
                default_namespace: pref.as_ref().and_then(|p| p.default_namespace.clone()),
                contexts: vec![],
            });
        }
    };

    let preferred = pref
        .as_ref()
        .and_then(|p| p.preferred_context.clone())
        .filter(|c| contexts.is_empty() || contexts.iter().any(|x| x.name == *c))
        .or_else(|| contexts.iter().find(|c| c.is_current).map(|c| c.name.clone()))
        .or_else(|| contexts.first().map(|c| c.name.clone()));

    Ok(KubeCredentialStatusDto {
        configured: true,
        path_display: display_home_path(&path),
        absolute_path: path.display().to_string(),
        preferred_context: preferred,
        default_namespace: pref.as_ref().and_then(|p| p.default_namespace.clone()),
        contexts,
    })
}

pub async fn get_saved_kubeconfig_yaml() -> Result<KubeconfigYamlDto, AppError> {
    let status = get_kube_credential_status().await?;
    if !status.configured {
        return Ok(KubeconfigYamlDto {
            configured: false,
            path_display: status.path_display,
            yaml: String::new(),
        });
    }
    let path = PathBuf::from(&status.absolute_path);
    let yaml = fs::read_to_string(&path).await.map_err(|err| {
        AppError::coded(
            "CREDENTIAL_STORE_ERROR",
            format!("无法读取 {}", path.display()),
            Some(err.to_string()),
            true,
        )
    })?;
    Ok(KubeconfigYamlDto {
        configured: true,
        path_display: status.path_display,
        yaml,
    })
}

pub async fn set_kube_preferred_context(
    context: String,
    default_namespace: Option<String>,
) -> Result<KubeCredentialStatusDto, AppError> {
    let status = get_kube_credential_status().await?;
    if !status.configured {
        return Err(AppError::coded(
            "CLUSTER_CONFIG_INVALID",
            "请先粘贴并保存 kubeconfig",
            None,
            false,
        ));
    }
    if !status.contexts.iter().any(|c| c.name == context) {
        return Err(AppError::coded(
            "CLUSTER_CONFIG_INVALID",
            format!("context 不存在: {context}"),
            None,
            false,
        ));
    }
    let mut file = read_connections().await;
    file.kubernetes = Some(KubernetesConnectionPref {
        kubeconfig_path: status.absolute_path.clone(),
        preferred_context: Some(context),
        default_namespace: default_namespace
            .filter(|s| !s.trim().is_empty())
            .or(status.default_namespace.clone()),
    });
    write_connections(&file).await?;
    get_kube_credential_status().await
}

pub async fn get_jenkins_local_config() -> Result<JenkinsLocalConfigDto, AppError> {
    let path = jenkins_config_path();
    let path_display = display_home_path(&path);
    if !path.exists() {
        return Ok(JenkinsLocalConfigDto {
            configured: false,
            path_display,
            base_url: String::new(),
            username: String::new(),
            api_token_set: false,
            webhook_enabled: true,
            webhook_port: 18765,
            webhook_token_set: false,
        });
    }
    let raw = fs::read_to_string(&path).await.map_err(|err| {
        AppError::coded(
            "JENKINS_CONFIG_INVALID",
            format!("cannot read {}", path.display()),
            Some(err.to_string()),
            false,
        )
    })?;
    let cfg: JenkinsConfigFileRead = serde_json::from_str(&raw).map_err(|err| {
        AppError::coded(
            "JENKINS_CONFIG_INVALID",
            "Jenkins config JSON is invalid",
            Some(err.to_string()),
            false,
        )
    })?;
    let webhook = cfg.webhook.unwrap_or(JenkinsWebhookFile {
        enabled: Some(true),
        port: Some(18765),
        token: None,
    });
    let api_token_set = !cfg.api_token.trim().is_empty();
    Ok(JenkinsLocalConfigDto {
        configured: !cfg.base_url.trim().is_empty()
            && !cfg.username.trim().is_empty()
            && api_token_set,
        path_display,
        base_url: cfg.base_url,
        username: cfg.username,
        api_token_set,
        webhook_enabled: webhook.enabled.unwrap_or(true),
        webhook_port: webhook.port.unwrap_or(18765),
        webhook_token_set: webhook
            .token
            .as_ref()
            .map(|t| !t.trim().is_empty())
            .unwrap_or(false),
    })
}

pub async fn save_jenkins_local_config(
    base_url: String,
    username: String,
    api_token: String,
    webhook_enabled: bool,
    webhook_port: u16,
    webhook_token: Option<String>,
) -> Result<JenkinsLocalConfigDto, AppError> {
    let path = jenkins_config_path();
    ensure_dir(&lancer_home()).await?;

    let existing_token = if path.exists() {
        let raw = fs::read_to_string(&path).await.unwrap_or_default();
        serde_json::from_str::<JenkinsConfigFileRead>(&raw)
            .ok()
            .map(|c| c.api_token)
            .unwrap_or_default()
    } else {
        String::new()
    };

    let token = if api_token.trim().is_empty() {
        existing_token
    } else {
        api_token.trim().to_string()
    };

    if base_url.trim().is_empty() || username.trim().is_empty() || token.is_empty() {
        return Err(AppError::coded(
            "JENKINS_CONFIG_INVALID",
            "baseUrl、username、apiToken 都不能为空",
            None,
            false,
        ));
    }

    let existing_webhook_token = if path.exists() {
        let raw = fs::read_to_string(&path).await.unwrap_or_default();
        serde_json::from_str::<JenkinsConfigFileRead>(&raw)
            .ok()
            .and_then(|c| c.webhook)
            .and_then(|w| w.token)
    } else {
        None
    };

    let webhook_token_final = match webhook_token {
        Some(t) if !t.trim().is_empty() => Some(t.trim().to_string()),
        Some(_) => None, // explicit clear with empty string
        None => existing_webhook_token,
    };

    let file = JenkinsConfigFileWrite {
        base_url: base_url.trim().trim_end_matches('/').to_string(),
        username: username.trim().to_string(),
        api_token: token,
        webhook: JenkinsWebhookFile {
            enabled: Some(webhook_enabled),
            port: Some(if webhook_port == 0 { 18765 } else { webhook_port }),
            token: webhook_token_final,
        },
    };

    let raw = serde_json::to_string_pretty(&file).map_err(|err| {
        AppError::coded(
            "JENKINS_CONFIG_INVALID",
            "failed to serialize jenkins.json",
            Some(err.to_string()),
            false,
        )
    })?;
    fs::write(&path, raw).await.map_err(|err| {
        AppError::coded(
            "CREDENTIAL_STORE_ERROR",
            format!("cannot write {}", path.display()),
            Some(err.to_string()),
            true,
        )
    })?;

    get_jenkins_local_config().await
}
