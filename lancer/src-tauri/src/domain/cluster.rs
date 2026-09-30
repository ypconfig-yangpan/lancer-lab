use serde::{Deserialize, Serialize};

/// Stable cluster identity. Never use displayName alone for operations.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ClusterId(pub String);

impl ClusterId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for ClusterId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EnvironmentRiskLevel {
    Local,
    Dev,
    Test,
    Staging,
    Prod,
}

/// How credentials are referenced for this connection (ADR 0006 / Phase 1.7).
/// V1: path reference only — never embed kubeconfig content in IPC/UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum CredentialMode {
    #[default]
    KubeconfigPath,
}

/// Cached SelfSubjectAccessReview results for UI gating (Phase 3 buttons later).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterCapabilities {
    pub can_list_pods: bool,
    pub can_get_pods: bool,
    pub can_delete_pods: bool,
    pub can_patch_deployments: bool,
    pub can_delete_deployments: bool,
    pub can_create_pods_exec: bool,
    pub can_get_pods_log: bool,
    /// True when SSAR probes completed without treating the whole batch as aborted.
    pub ssar_ok: bool,
}

impl ClusterCapabilities {
    pub fn force_readonly(mut self) -> Self {
        self.can_delete_pods = false;
        self.can_patch_deployments = false;
        self.can_delete_deployments = false;
        self.can_create_pods_exec = false;
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterIdentity {
    pub id: ClusterId,
    pub display_name: String,
    pub api_server: String,
    pub ca_fingerprint: String,
    pub context: String,
    pub risk_level: EnvironmentRiskLevel,
    pub tls_insecure: bool,
    /// User-selected connection mode: blocks write commands when true.
    pub readonly: bool,
    pub credential_mode: CredentialMode,
    /// Home-abbreviated path only — never secret material.
    pub kubeconfig_path_display: String,
    pub capabilities: ClusterCapabilities,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn force_readonly_clears_write_capabilities() {
        let caps = ClusterCapabilities {
            can_list_pods: true,
            can_get_pods: true,
            can_delete_pods: true,
            can_patch_deployments: true,
            can_delete_deployments: true,
            can_create_pods_exec: true,
            can_get_pods_log: true,
            ssar_ok: true,
        }
        .force_readonly();
        assert!(caps.can_list_pods);
        assert!(!caps.can_delete_pods);
        assert!(!caps.can_patch_deployments);
        assert!(!caps.can_delete_deployments);
        assert!(!caps.can_create_pods_exec);
        assert!(caps.can_get_pods_log);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KubeContextSummary {
    pub name: String,
    pub cluster: String,
    pub user: String,
    pub namespace: Option<String>,
    pub is_current: bool,
}
