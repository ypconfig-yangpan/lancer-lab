use serde::Serialize;
use tauri::State;

use crate::application::AppServices;
use crate::shared::diagnostics;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    pub status: String,
    pub phase: String,
    pub kubernetes_connected: bool,
    pub last_abnormal_exit: bool,
    pub log_dir: String,
}

#[tauri::command]
pub fn app_health() -> HealthStatus {
    HealthStatus {
        status: "ok".into(),
        phase: "phase0".into(),
        kubernetes_connected: false,
        last_abnormal_exit: diagnostics::last_abnormal_exit(),
        log_dir: diagnostics::log_dir_display(),
    }
}

#[tauri::command]
pub fn ack_abnormal_exit() {
    diagnostics::ack_abnormal_exit();
}

#[tauri::command]
pub fn list_diagnostic_log_files() -> Vec<String> {
    diagnostics::list_log_file_names()
}

/// Frontend composition-root shutdown: stop watches and disconnect clusters.
#[tauri::command]
pub async fn app_prepare_shutdown(services: State<'_, AppServices>) -> Result<(), ()> {
    services.prepare_shutdown().await;
    Ok(())
}

/// Quit the whole process after graceful frontend shutdown (macOS destroy-only can leave a blank window).
#[tauri::command]
pub fn app_request_exit(app: tauri::AppHandle) {
    app.exit(0);
}
