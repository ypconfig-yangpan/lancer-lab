//! Kube log follow → append JSONL on disk (Phase 2.2b).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::{AsyncBufReadExt, TryStreamExt};
use k8s_openapi::api::core::v1::Pod;
use kube::api::{Api, LogParams};
use kube::Client;
use serde::Serialize;
use tauri::Emitter;
use tokio::sync::Mutex;
use tracing::{info, warn};

use crate::domain::error::AppError;
use crate::infrastructure::managed_logs::{append_jsonl_lines, LogLineDto, SessionState};

pub const MANAGED_LOG_APPENDED_EVENT: &str = "managed-log-appended";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedLogAppendedPayload {
    pub session_id: String,
    pub total_lines: u64,
    pub status: String,
}

/// Spawn follow task; caller stores AbortHandle on the session.
pub fn spawn_kube_follow(
    app: tauri::AppHandle,
    sessions: Arc<Mutex<std::collections::HashMap<String, SessionState>>>,
    session_id: String,
    path: PathBuf,
    client: Client,
    namespace: String,
    pod: String,
    container: String,
    follow: bool,
    previous: bool,
    since_seconds: Option<i64>,
    tail_lines: Option<i64>,
    line_counter: Arc<AtomicU64>,
    paused: Arc<AtomicBool>,
) -> tokio::task::AbortHandle {
    let join = tokio::spawn(async move {
        let result = run_follow(
            app.clone(),
            sessions.clone(),
            session_id.clone(),
            path,
            client,
            namespace,
            pod,
            container,
            follow,
            previous,
            since_seconds,
            tail_lines,
            line_counter,
            paused,
        )
        .await;

        if let Err(err) = result {
            warn!(
                target: "lancer::logs",
                session_id = %session_id,
                error = %err,
                "kube log follow ended with error"
            );
            let mut guard = sessions.lock().await;
            if let Some(session) = guard.get_mut(&session_id) {
                session.info.status = "error".to_string();
                let total = session.line_counter.load(Ordering::SeqCst);
                session.info.total_lines = total;
                let _ = app.emit(
                    MANAGED_LOG_APPENDED_EVENT,
                    ManagedLogAppendedPayload {
                        session_id: session_id.clone(),
                        total_lines: total,
                        status: session.info.status.clone(),
                    },
                );
            }
        }
    });
    join.abort_handle()
}

async fn run_follow(
    app: tauri::AppHandle,
    sessions: Arc<Mutex<std::collections::HashMap<String, SessionState>>>,
    session_id: String,
    path: PathBuf,
    client: Client,
    namespace: String,
    pod: String,
    container: String,
    follow: bool,
    previous: bool,
    since_seconds: Option<i64>,
    tail_lines: Option<i64>,
    line_counter: Arc<AtomicU64>,
    paused: Arc<AtomicBool>,
) -> Result<(), AppError> {
    let api: Api<Pod> = Api::namespaced(client, &namespace);
    // since_seconds and tail_lines are mutually exclusive in practice; 0 / None = unlimited history.
    let effective_tail = if since_seconds.is_some() {
        None
    } else {
        match tail_lines {
            None => Some(5_000),
            Some(0) => None,
            Some(n) => Some(n),
        }
    };
    let params = LogParams {
        follow,
        timestamps: true,
        previous,
        since_seconds,
        container: if container.is_empty() {
            None
        } else {
            Some(container.clone())
        },
        tail_lines: effective_tail,
        ..LogParams::default()
    };

    info!(
        target: "lancer::logs",
        session_id = %session_id,
        namespace = %namespace,
        pod = %pod,
        container = %container,
        follow,
        previous,
        since_seconds = ?since_seconds,
        tail_lines = ?effective_tail,
        "starting kube log stream"
    );

    let stream = api.log_stream(&pod, &params).await.map_err(|e| {
        AppError::coded(
            "LOG_STREAM_FAILED",
            format!("failed to open kube log stream: {e}"),
            Some(e.to_string()),
            true,
        )
    })?;

    let mut lines = stream.lines();
    let mut pending: Vec<LogLineDto> = Vec::with_capacity(32);
    let mut since_emit = 0u32;
    // Stream cursor for overlap dedup (docs/logs/history-live-resume.md).
    let mut last_ts = String::new();
    let mut last_msg = String::new();

    loop {
        if paused.load(Ordering::SeqCst) {
            set_session_status(&sessions, &session_id, "paused").await;
            while paused.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_millis(200)).await;
            }
            set_session_status(
                &sessions,
                &session_id,
                if follow { "following" } else { "open" },
            )
            .await;
        }

        let next = lines.try_next().await.map_err(|e| {
            AppError::coded(
                "LOG_STREAM_INTERRUPTED",
                format!("log stream read failed: {e}"),
                Some(e.to_string()),
                true,
            )
        })?;

        let Some(raw) = next else {
            info!(
                target: "lancer::logs",
                session_id = %session_id,
                "kube log stream ended"
            );
            if !pending.is_empty() {
                flush_batch(
                    &app,
                    &sessions,
                    &session_id,
                    &path,
                    &mut pending,
                    &line_counter,
                )
                .await?;
            }
            set_session_status(&sessions, &session_id, "open").await;
            return Ok(());
        };

        let (ts, message) = split_kube_timestamp(&raw);
        if !ts.is_empty()
            && !last_ts.is_empty()
            && ts <= last_ts.as_str()
            && message == last_msg
        {
            continue;
        }
        if !ts.is_empty() {
            last_ts = ts.to_string();
            last_msg = message.to_string();
        }

        let n = line_counter.fetch_add(1, Ordering::SeqCst) + 1;
        pending.push(parse_kube_line(n, &pod, &container, &raw));
        since_emit += 1;

        if pending.len() >= 32 || since_emit >= 32 {
            flush_batch(
                &app,
                &sessions,
                &session_id,
                &path,
                &mut pending,
                &line_counter,
            )
            .await?;
            since_emit = 0;
        }
    }
}

async fn flush_batch(
    app: &tauri::AppHandle,
    sessions: &Arc<Mutex<std::collections::HashMap<String, SessionState>>>,
    session_id: &str,
    path: &PathBuf,
    pending: &mut Vec<LogLineDto>,
    line_counter: &Arc<AtomicU64>,
) -> Result<(), AppError> {
    if pending.is_empty() {
        return Ok(());
    }
    let batch = std::mem::take(pending);
    let path_write = path.clone();
    let written = tokio::task::spawn_blocking(move || append_jsonl_lines(&path_write, &batch))
        .await
        .map_err(|e| {
            AppError::coded(
                "LOG_STREAM_FAILED",
                "failed to join log append task",
                Some(e.to_string()),
                false,
            )
        })??;

    let total = {
        let mut guard = sessions.lock().await;
        if let Some(session) = guard.get_mut(session_id) {
            // Counter already advanced; sync info from atomic for readers.
            session.info.total_lines = line_counter.load(Ordering::SeqCst);
            session.info.total_lines
        } else {
            return Ok(());
        }
    };

    let _ = written;
    if let Err(err) = app.emit(
        MANAGED_LOG_APPENDED_EVENT,
        ManagedLogAppendedPayload {
            session_id: session_id.to_string(),
            total_lines: total,
            status: "following".to_string(),
        },
    ) {
        warn!(target: "lancer::logs", error = %err, "emit managed-log-appended failed");
    }
    Ok(())
}

async fn set_session_status(
    sessions: &Arc<Mutex<std::collections::HashMap<String, SessionState>>>,
    session_id: &str,
    status: &str,
) {
    let mut guard = sessions.lock().await;
    if let Some(session) = guard.get_mut(session_id) {
        if session.info.status != status {
            session.info.status = status.to_string();
        }
    }
}

fn parse_kube_line(line_number: u64, pod: &str, container: &str, raw: &str) -> LogLineDto {
    let (timestamp, message) = split_kube_timestamp(raw);
    let level = infer_level(message);
    LogLineDto {
        id: format!("k8s-{line_number}"),
        line_number,
        timestamp: timestamp.to_string(),
        level: level.to_string(),
        pod: pod.to_string(),
        container: container.to_string(),
        message: message.to_string(),
    }
}

fn split_kube_timestamp(raw: &str) -> (&str, &str) {
    // kube timestamps=true → "RFC3339 message"
    let Some((ts, rest)) = raw.split_once(' ') else {
        return ("", raw);
    };
    if ts.len() >= 20 && ts.contains('T') {
        (ts, rest)
    } else {
        ("", raw)
    }
}

fn infer_level(message: &str) -> &'static str {
    let upper = message.to_ascii_uppercase();
    if upper.contains("ERROR") || upper.contains("FATAL") || upper.contains("PANIC") {
        "ERROR"
    } else if upper.contains("WARN") {
        "WARN"
    } else if upper.contains("DEBUG") || upper.contains("TRACE") {
        "DEBUG"
    } else {
        "INFO"
    }
}
