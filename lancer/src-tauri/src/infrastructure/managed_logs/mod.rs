//! Disk-as-Source managed log sessions (Pod / workload logs).
//! Separate from Desktop `app.log` diagnostics under the app log dir.
//!
//! Phase 2.2a: seed JSONL on open.
//! Phase 2.2b: when `connection_id` is set and `seed_lines` is None → kube follow → append.

mod stream;

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use kube::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::task;

use crate::domain::error::AppError;

#[allow(unused_imports)] // re-exported for IPC/event consumers
pub use stream::{ManagedLogAppendedPayload, MANAGED_LOG_APPENDED_EVENT};

const DEFAULT_SEED_LINES: usize = 20_000;
const MAX_WINDOW_LIMIT: usize = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLineDto {
    pub id: String,
    pub line_number: u64,
    pub timestamp: String,
    pub level: String,
    pub pod: String,
    pub container: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSessionInfoDto {
    pub session_id: String,
    pub provider: String,
    pub source_label: String,
    pub status: String,
    pub total_lines: u64,
    pub truncated: bool,
    /// Absolute path of the on-disk source (diagnostics / debug).
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogWindowDto {
    pub session_id: String,
    pub offset: u64,
    pub lines: Vec<LogLineDto>,
    pub total_lines: u64,
    pub truncated: bool,
}

#[derive(Debug, Clone)]
pub struct OpenManagedLogInput {
    pub provider: String,
    pub connection_id: Option<String>,
    pub namespace: Option<String>,
    pub pod: Option<String>,
    pub container: Option<String>,
    pub follow: bool,
    pub seed_lines: Option<usize>,
}

pub(crate) struct SessionState {
    pub info: LogSessionInfoDto,
    pub path: PathBuf,
    pub abort: Option<tokio::task::AbortHandle>,
    pub paused: Arc<AtomicBool>,
    pub line_counter: Arc<AtomicU64>,
}

/// Host-owned disk log sessions. Source of truth is the file; UI only reads windows.
#[derive(Clone)]
pub struct ManagedLogStore {
    root: Arc<Mutex<Option<PathBuf>>>,
    sessions: Arc<Mutex<HashMap<String, SessionState>>>,
}

impl ManagedLogStore {
    pub fn new() -> Self {
        Self {
            root: Arc::new(Mutex::new(None)),
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn set_root(&self, root: PathBuf) -> Result<(), AppError> {
        fs::create_dir_all(&root).map_err(|e| map_io_error("create managed-logs dir", e))?;
        let mut guard = self.root.lock().await;
        *guard = Some(root);
        Ok(())
    }

    /// Seed path (tests / no cluster). `seed_lines: Some(n)` forces seed even with connection_id.
    pub async fn open(&self, input: OpenManagedLogInput) -> Result<LogSessionInfoDto, AppError> {
        let (path, meta) = self.prepare_session_file(&input).await?;
        let seed = input.seed_lines.unwrap_or(DEFAULT_SEED_LINES);
        let path_for_write = path.clone();
        let pod_for_write = meta.pod_label.clone();
        let container_for_write = meta.container_label.clone();
        let written = task::spawn_blocking(move || {
            write_seed_file(&path_for_write, seed, &pod_for_write, &container_for_write)
        })
        .await
        .map_err(|e| {
            AppError::coded(
                "LOG_STREAM_FAILED",
                "failed to join seed write task",
                Some(e.to_string()),
                false,
            )
        })??;

        let status = if input.follow {
            "following"
        } else {
            "open"
        };
        let info = LogSessionInfoDto {
            session_id: meta.session_id.clone(),
            provider: input.provider,
            source_label: meta.source_label,
            status: status.to_string(),
            total_lines: written as u64,
            truncated: false,
            file_path: path.display().to_string(),
        };

        self.sessions.lock().await.insert(
            meta.session_id,
            SessionState {
                info: info.clone(),
                path,
                abort: None,
                paused: Arc::new(AtomicBool::new(false)),
                line_counter: Arc::new(AtomicU64::new(written as u64)),
            },
        );

        Ok(info)
    }

    /// Empty file + register session; caller starts kube follow.
    pub async fn open_for_stream(
        &self,
        input: OpenManagedLogInput,
    ) -> Result<(LogSessionInfoDto, PathBuf, Arc<AtomicU64>, Arc<AtomicBool>), AppError> {
        let (path, meta) = self.prepare_session_file(&input).await?;
        let path_create = path.clone();
        task::spawn_blocking(move || create_empty_log_file(&path_create))
            .await
            .map_err(|e| {
                AppError::coded(
                    "LOG_STREAM_FAILED",
                    "failed to join create log file task",
                    Some(e.to_string()),
                    false,
                )
            })??;

        let status = if input.follow {
            "following"
        } else {
            "open"
        };
        let line_counter = Arc::new(AtomicU64::new(0));
        let paused = Arc::new(AtomicBool::new(false));
        let info = LogSessionInfoDto {
            session_id: meta.session_id.clone(),
            provider: input.provider,
            source_label: meta.source_label,
            status: status.to_string(),
            total_lines: 0,
            truncated: false,
            file_path: path.display().to_string(),
        };

        self.sessions.lock().await.insert(
            meta.session_id.clone(),
            SessionState {
                info: info.clone(),
                path: path.clone(),
                abort: None,
                paused: paused.clone(),
                line_counter: line_counter.clone(),
            },
        );

        Ok((info, path, line_counter, paused))
    }

    pub async fn attach_follow_abort(
        &self,
        session_id: &str,
        abort: tokio::task::AbortHandle,
    ) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| session_not_found(session_id))?;
        session.abort = Some(abort);
        Ok(())
    }

    pub(crate) fn sessions_handle(&self) -> Arc<Mutex<HashMap<String, SessionState>>> {
        self.sessions.clone()
    }

    pub async fn set_paused(&self, session_id: &str, paused: bool) -> Result<LogSessionInfoDto, AppError> {
        let mut sessions = self.sessions.lock().await;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| session_not_found(session_id))?;
        session.paused.store(paused, Ordering::SeqCst);
        session.info.status = if paused {
            "paused".to_string()
        } else if session.abort.is_some() {
            "following".to_string()
        } else {
            "open".to_string()
        };
        Ok(session.info.clone())
    }

    pub async fn get_session(&self, session_id: &str) -> Result<LogSessionInfoDto, AppError> {
        let sessions = self.sessions.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| session_not_found(session_id))?;
        let mut info = session.info.clone();
        info.total_lines = session.line_counter.load(Ordering::SeqCst);
        Ok(info)
    }

    pub async fn read_window(
        &self,
        session_id: &str,
        offset: u64,
        limit: u64,
    ) -> Result<LogWindowDto, AppError> {
        let (path, total_lines) = {
            let sessions = self.sessions.lock().await;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| session_not_found(session_id))?;
            (
                session.path.clone(),
                session.line_counter.load(Ordering::SeqCst),
            )
        };

        let limit = (limit as usize).clamp(1, MAX_WINDOW_LIMIT);
        let offset = offset as usize;
        let path_for_read = path.clone();
        let lines = task::spawn_blocking(move || read_window_from_file(&path_for_read, offset, limit))
            .await
            .map_err(|e| {
                AppError::coded(
                    "LOG_STREAM_FAILED",
                    "failed to join window read task",
                    Some(e.to_string()),
                    true,
                )
            })??;

        Ok(LogWindowDto {
            session_id: session_id.to_string(),
            offset: offset as u64,
            truncated: total_lines > (offset as u64) + (lines.len() as u64),
            lines,
            total_lines,
        })
    }

    pub async fn close(&self, session_id: &str) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock().await;
        let Some(mut session) = sessions.remove(session_id) else {
            return Err(session_not_found(session_id));
        };
        if let Some(abort) = session.abort.take() {
            abort.abort();
        }
        session.info.status = "closed".to_string();
        // Keep the on-disk file for later inspection / export; do not delete yet.
        Ok(())
    }

    pub async fn clear_all(&self) {
        let mut sessions = self.sessions.lock().await;
        for (_, mut session) in sessions.drain() {
            if let Some(abort) = session.abort.take() {
                abort.abort();
            }
        }
    }

    async fn prepare_session_file(
        &self,
        input: &OpenManagedLogInput,
    ) -> Result<(PathBuf, SessionMeta), AppError> {
        let root = self
            .root
            .lock()
            .await
            .clone()
            .ok_or_else(|| {
                AppError::coded(
                    "LOG_STREAM_FAILED",
                    "managed log store root is not initialized",
                    None,
                    false,
                )
            })?;

        let cluster = sanitize_segment(
            input
                .connection_id
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("local"),
        );
        let namespace = sanitize_segment(input.namespace.as_deref().unwrap_or("default"));
        let pod = sanitize_segment(
            input
                .pod
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("unknown-pod"),
        );
        let container = sanitize_segment(
            input
                .container
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("app"),
        );
        let start_time = start_time_token();
        let session_id = format!("log_{start_time}_{}", next_seq());
        let file_name = format!("{cluster}_{namespace}_{pod}_{container}_{start_time}.log");
        let path = root.join(&file_name);
        let pod_label = input
            .pod
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| pod.clone());
        let container_label = input
            .container
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| container.clone());
        let ns_label = input
            .namespace
            .clone()
            .unwrap_or_else(|| namespace.clone());

        Ok((
            path,
            SessionMeta {
                session_id,
                source_label: format!("{ns_label}/{pod_label}/{container_label}"),
                pod_label,
                container_label,
            },
        ))
    }
}

struct SessionMeta {
    session_id: String,
    source_label: String,
    pod_label: String,
    container_label: String,
}

impl Default for ManagedLogStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Start kube follow for an existing stream session.
pub fn start_kube_follow(
    app: tauri::AppHandle,
    store: &ManagedLogStore,
    session_id: String,
    path: PathBuf,
    client: Client,
    namespace: String,
    pod: String,
    container: String,
    follow: bool,
    line_counter: Arc<AtomicU64>,
    paused: Arc<AtomicBool>,
) -> tokio::task::AbortHandle {
    stream::spawn_kube_follow(
        app,
        store.sessions_handle(),
        session_id,
        path,
        client,
        namespace,
        pod,
        container,
        follow,
        line_counter,
        paused,
    )
}

pub(crate) fn append_jsonl_lines(path: &Path, lines: &[LogLineDto]) -> Result<usize, AppError> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| map_io_error("append managed log file", e))?;
    for line in lines {
        let json = serde_json::to_string(line).map_err(|e| {
            AppError::coded(
                "LOG_STREAM_FAILED",
                "failed to serialize log line",
                Some(e.to_string()),
                false,
            )
        })?;
        writeln!(file, "{json}").map_err(|e| map_io_error("write managed log line", e))?;
    }
    file.flush()
        .map_err(|e| map_io_error("flush managed log file", e))?;
    Ok(lines.len())
}

pub(crate) fn map_io_error(context: &str, err: std::io::Error) -> AppError {
    let code = if err.raw_os_error() == Some(28) {
        "LOG_DISK_FULL"
    } else {
        "LOG_STREAM_FAILED"
    };
    AppError::coded(code, format!("{context}: {err}"), Some(err.to_string()), false)
}

fn session_not_found(session_id: &str) -> AppError {
    AppError::coded(
        "LOG_FILE_NOT_FOUND",
        format!("log session not found: {session_id}"),
        None,
        false,
    )
}

fn sanitize_segment(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for c in raw.chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "_".to_string()
    } else {
        out
    }
}

fn start_time_token() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("{millis}")
}

fn next_seq() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(1);
    SEQ.fetch_add(1, Ordering::Relaxed)
}

fn mock_timestamp(index: usize) -> String {
    let total_ms = index as u64 * 250;
    let total_secs = total_ms / 1000;
    let h = 2 + total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    let ms = total_ms % 1000;
    format!("2026-09-01T{h:02}:{m:02}:{s:02}.{ms:03}Z")
}

fn mock_level(index: usize) -> &'static str {
    match index % 6 {
        3 => "WARN",
        4 => "ERROR",
        5 => "DEBUG",
        _ => "INFO",
    }
}

fn mock_message(index: usize, level: &str) -> String {
    match level {
        "ERROR" => format!("Failed to handle request id={index} status=500"),
        "WARN" => format!("Slow request id={index} durationMs={}", 200 + (index % 50)),
        _ => format!("Handled GET /api/health id={index}"),
    }
}

fn create_empty_log_file(path: &Path) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| map_io_error("create parent", e))?;
    }
    File::create(path).map_err(|e| map_io_error("create managed log file", e))?;
    Ok(())
}

fn write_seed_file(
    path: &Path,
    count: usize,
    pod: &str,
    container: &str,
) -> Result<usize, AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| map_io_error("create parent", e))?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|e| map_io_error("open managed log file", e))?;

    for i in 0..count {
        let level = mock_level(i);
        let line = LogLineDto {
            id: format!("log-{i}"),
            line_number: (i + 1) as u64,
            timestamp: mock_timestamp(i),
            level: level.to_string(),
            pod: pod.to_string(),
            container: container.to_string(),
            message: mock_message(i, level),
        };
        let json = serde_json::to_string(&line).map_err(|e| {
            AppError::coded(
                "LOG_STREAM_FAILED",
                "failed to serialize log line",
                Some(e.to_string()),
                false,
            )
        })?;
        writeln!(file, "{json}").map_err(|e| map_io_error("write managed log line", e))?;
    }
    file.flush()
        .map_err(|e| map_io_error("flush managed log file", e))?;
    Ok(count)
}

fn read_window_from_file(
    path: &Path,
    offset: usize,
    limit: usize,
) -> Result<Vec<LogLineDto>, AppError> {
    let file = File::open(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::coded(
                "LOG_FILE_NOT_FOUND",
                format!("managed log file missing: {}", path.display()),
                None,
                false,
            )
        } else {
            map_io_error("open managed log for read", e)
        }
    })?;
    let reader = BufReader::new(file);
    let mut lines = Vec::with_capacity(limit);
    for (idx, result) in reader.lines().enumerate() {
        if idx < offset {
            continue;
        }
        if lines.len() >= limit {
            break;
        }
        let raw = result.map_err(|e| map_io_error("read managed log line", e))?;
        match serde_json::from_str::<LogLineDto>(&raw) {
            Ok(line) => lines.push(line),
            Err(_) => {
                lines.push(LogLineDto {
                    id: format!("raw-{idx}"),
                    line_number: (idx + 1) as u64,
                    timestamp: String::new(),
                    level: "UNKNOWN".to_string(),
                    pod: String::new(),
                    container: String::new(),
                    message: raw,
                });
            }
        }
    }
    Ok(lines)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn open_read_close_roundtrip() {
        let root = std::env::temp_dir().join(format!(
            "lancer-managed-logs-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        let store = ManagedLogStore::new();
        store.set_root(root.clone()).await.unwrap();

        let info = store
            .open(OpenManagedLogInput {
                provider: "kubernetes".into(),
                connection_id: Some("ctx-a".into()),
                namespace: Some("default".into()),
                pod: Some("svc-1".into()),
                container: Some("app".into()),
                follow: true,
                seed_lines: Some(100),
            })
            .await
            .unwrap();

        assert_eq!(info.total_lines, 100);
        assert!(info.file_path.contains("ctx-a_default_svc-1_app_"));
        assert!(Path::new(&info.file_path).exists());

        let window = store
            .read_window(&info.session_id, 90, 20)
            .await
            .unwrap();
        assert_eq!(window.lines.len(), 10);
        assert_eq!(window.lines[0].line_number, 91);

        store.close(&info.session_id).await.unwrap();
        let err = store.get_session(&info.session_id).await.unwrap_err();
        assert!(matches!(
            err,
            AppError::Coded {
                code: "LOG_FILE_NOT_FOUND",
                ..
            }
        ));
        assert!(Path::new(&info.file_path).exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sanitize_replaces_path_separators() {
        assert_eq!(sanitize_segment("a/b:c"), "a_b_c");
    }
}
