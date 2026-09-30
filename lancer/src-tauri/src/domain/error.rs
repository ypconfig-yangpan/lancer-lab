use serde::Serialize;
use thiserror::Error;

use crate::domain::cluster::ClusterId;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{message}")]
    Coded {
        code: &'static str,
        message: String,
        detail: Option<String>,
        retryable: bool,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorDto {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
    pub retryable: bool,
}

impl AppError {
    pub fn coded(
        code: &'static str,
        message: impl Into<String>,
        detail: Option<String>,
        retryable: bool,
    ) -> Self {
        Self::Coded {
            code,
            message: message.into(),
            detail,
            retryable,
        }
    }

    pub fn kubeconfig_invalid(message: impl Into<String>, detail: Option<String>) -> Self {
        Self::coded("CLUSTER_CONFIG_INVALID", message, detail, false)
    }

    pub fn auth_failed(message: impl Into<String>, detail: Option<String>) -> Self {
        Self::coded("CLUSTER_AUTH_FAILED", message, detail, false)
    }

    pub fn unreachable(message: impl Into<String>, detail: Option<String>) -> Self {
        Self::coded("CLUSTER_UNREACHABLE", message, detail, true)
    }

    pub fn tls_failed(message: impl Into<String>, detail: Option<String>) -> Self {
        Self::coded("CLUSTER_TLS_FAILED", message, detail, false)
    }

    pub fn permission_denied(message: impl Into<String>, detail: Option<String>) -> Self {
        Self::coded("K8S_FORBIDDEN", message, detail, false)
    }

    pub fn not_found(message: impl Into<String>, detail: Option<String>) -> Self {
        Self::coded("K8S_NOT_FOUND", message, detail, false)
    }

    pub fn api_error(message: impl Into<String>, detail: Option<String>) -> Self {
        Self::coded("K8S_API_ERROR", message, detail, true)
    }

    pub fn namespace_required() -> Self {
        Self::coded("NAMESPACE_REQUIRED", "namespace is required", None, false)
    }

    pub fn cluster_not_connected(cluster_id: &ClusterId) -> Self {
        Self::coded(
            "CLUSTER_NOT_CONNECTED",
            format!("cluster not connected: {cluster_id}"),
            None,
            false,
        )
    }

    pub fn cluster_readonly(message: impl Into<String>) -> Self {
        Self::coded("CLUSTER_READONLY", message, None, false)
    }

    pub fn to_dto(&self) -> AppErrorDto {
        match self {
            Self::Coded {
                code,
                message,
                detail,
                retryable,
            } => AppErrorDto {
                code: (*code).to_string(),
                message: message.clone(),
                detail: detail.clone(),
                retryable: *retryable,
            },
        }
    }
}

impl From<AppError> for AppErrorDto {
    fn from(value: AppError) -> Self {
        value.to_dto()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_coded_error_to_dto() {
        let err = AppError::unreachable("cluster unreachable", Some("timeout".into()));
        let dto = err.to_dto();
        assert_eq!(dto.code, "CLUSTER_UNREACHABLE");
        assert!(dto.retryable);
        assert_eq!(dto.detail.as_deref(), Some("timeout"));
    }
}
