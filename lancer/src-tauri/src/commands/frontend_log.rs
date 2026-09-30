use serde::Deserialize;

use crate::shared::redact::{redact_json, redact_text};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendLogEvent {
    pub level: String,
    pub message: String,
    #[serde(default)]
    pub fields: Option<serde_json::Value>,
}

/// Persist a small set of frontend diagnostics. High-frequency UI logs must not use this.
#[tauri::command]
pub fn report_frontend_log(event: FrontendLogEvent) {
    let message = redact_text(&event.message);
    let fields = event.fields.as_ref().map(redact_json);
    match event.level.as_str() {
        "error" => {
            tracing::error!(
                target: "lancer::frontend",
                fields = ?fields,
                message = %message,
                "frontend error"
            );
        }
        "warn" => {
            tracing::warn!(
                target: "lancer::frontend",
                fields = ?fields,
                message = %message,
                "frontend warning"
            );
        }
        "info" => {
            tracing::info!(
                target: "lancer::frontend",
                fields = ?fields,
                message = %message,
                "frontend operation"
            );
        }
        _ => {
            tracing::debug!(
                target: "lancer::frontend",
                level = %event.level,
                "ignored frontend log level"
            );
        }
    }
}
