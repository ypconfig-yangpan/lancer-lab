use serde::Deserialize;
use tauri::State;

use crate::application::AppServices;
use crate::domain::error::AppErrorDto;
use crate::infrastructure::managed_logs::{
    FindLineAtTimeDto, LogSessionInfoDto, LogWindowDto, OpenManagedLogInput, SearchResultDto,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenManagedLogRequest {
    pub provider: String,
    pub connection_id: Option<String>,
    pub namespace: Option<String>,
    pub pod: Option<String>,
    pub container: Option<String>,
    pub follow: Option<bool>,
    pub seed_lines: Option<usize>,
    pub previous: Option<bool>,
    pub since_seconds: Option<i64>,
    pub tail_lines: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedLogSessionRequest {
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadManagedLogWindowRequest {
    pub session_id: String,
    pub offset: u64,
    pub limit: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PauseManagedLogRequest {
    pub session_id: String,
    pub paused: bool,
}

#[tauri::command]
pub async fn open_managed_log_session(
    app: tauri::AppHandle,
    services: State<'_, AppServices>,
    input: OpenManagedLogRequest,
) -> Result<LogSessionInfoDto, AppErrorDto> {
    services
        .open_managed_log(
            app,
            OpenManagedLogInput {
                provider: input.provider,
                connection_id: input.connection_id,
                namespace: input.namespace,
                pod: input.pod,
                container: input.container,
                follow: input.follow.unwrap_or(true),
                seed_lines: input.seed_lines,
                previous: input.previous.unwrap_or(false),
                since_seconds: input.since_seconds,
                tail_lines: input.tail_lines,
            },
        )
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn get_managed_log_session(
    services: State<'_, AppServices>,
    input: ManagedLogSessionRequest,
) -> Result<LogSessionInfoDto, AppErrorDto> {
    services
        .get_managed_log_session(input.session_id)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn read_managed_log_window(
    services: State<'_, AppServices>,
    input: ReadManagedLogWindowRequest,
) -> Result<LogWindowDto, AppErrorDto> {
    services
        .read_managed_log_window(input.session_id, input.offset, input.limit)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn close_managed_log_session(
    services: State<'_, AppServices>,
    input: ManagedLogSessionRequest,
) -> Result<(), AppErrorDto> {
    services
        .close_managed_log_session(input.session_id)
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn pause_managed_log_session(
    services: State<'_, AppServices>,
    input: PauseManagedLogRequest,
) -> Result<LogSessionInfoDto, AppErrorDto> {
    services
        .pause_managed_log_session(input.session_id, input.paused)
        .await
        .map_err(AppErrorDto::from)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchManagedLogRequest {
    pub session_id: String,
    pub pattern: String,
    pub regex: Option<bool>,
    pub case_sensitive: Option<bool>,
    pub max_matches: Option<u64>,
    pub cursor_byte: Option<u64>,
}

#[tauri::command]
pub async fn search_managed_log(
    services: State<'_, AppServices>,
    input: SearchManagedLogRequest,
) -> Result<SearchResultDto, AppErrorDto> {
    services
        .search_managed_log(
            input.session_id,
            input.pattern,
            input.regex.unwrap_or(false),
            input.case_sensitive.unwrap_or(false),
            input.max_matches.unwrap_or(200),
            input.cursor_byte.unwrap_or(0),
        )
        .await
        .map_err(AppErrorDto::from)
}

#[tauri::command]
pub async fn cancel_managed_log_search(
    services: State<'_, AppServices>,
    input: ManagedLogSessionRequest,
) -> Result<(), AppErrorDto> {
    services
        .cancel_managed_log_search(input.session_id)
        .await
        .map_err(AppErrorDto::from)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindManagedLogLineAtTimeRequest {
    pub session_id: String,
    pub target: String,
}

#[tauri::command]
pub async fn find_managed_log_line_at_time(
    services: State<'_, AppServices>,
    input: FindManagedLogLineAtTimeRequest,
) -> Result<FindLineAtTimeDto, AppErrorDto> {
    services
        .find_managed_log_line_at_time(input.session_id, input.target)
        .await
        .map_err(AppErrorDto::from)
}
