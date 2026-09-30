use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::fmt;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

use crate::shared::redact::redact_text;

/// Keep rotated app logs for two weeks.
pub const LOG_RETENTION_DAYS: u64 = 14;
/// Cap total diagnostic log size so a long-running desktop does not fill the disk.
pub const LOG_MAX_TOTAL_BYTES: u64 = 500 * 1024 * 1024;
const LOG_FILE_PREFIX: &str = "app.log";
const CRASH_MARKER: &str = "crash.marker";

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();
static PENDING_CRASH: AtomicBool = AtomicBool::new(false);

pub struct TracingGuard {
    _non_blocking: WorkerGuard,
}

fn default_env_filter() -> EnvFilter {
    let default = if cfg!(debug_assertions) {
        "lancer=debug,lancer_lib=debug"
    } else {
        "lancer=info,lancer_lib=info"
    };
    EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(default))
}

/// Install fmt + rolling file subscriber. Keep the returned guard for process lifetime.
pub fn init(log_dir: &Path) -> Result<TracingGuard, std::io::Error> {
    fs::create_dir_all(log_dir)?;
    prune_old_logs(log_dir);
    let _ = LOG_DIR.set(log_dir.to_path_buf());
    PENDING_CRASH.store(take_crash_marker(log_dir), Ordering::SeqCst);

    let file_appender = tracing_appender::rolling::daily(log_dir, LOG_FILE_PREFIX);
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let stdout_layer = fmt::layer().with_target(true).with_writer(std::io::stdout);
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_target(true)
        .with_writer(non_blocking);

    tracing_subscriber::registry()
        .with(default_env_filter())
        .with(stdout_layer)
        .with(file_layer)
        .init();

    install_panic_hook();
    Ok(TracingGuard {
        _non_blocking: guard,
    })
}

pub fn log_dir_display() -> String {
    LOG_DIR
        .get()
        .map(|p| p.display().to_string())
        .unwrap_or_default()
}

pub fn last_abnormal_exit() -> bool {
    PENDING_CRASH.load(Ordering::SeqCst)
}

pub fn ack_abnormal_exit() {
    PENDING_CRASH.store(false, Ordering::SeqCst);
}

/// File names under the rolling app log directory (for diagnostics export UI).
pub fn list_log_file_names() -> Vec<String> {
    let Some(dir) = LOG_DIR.get() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            if name.starts_with(LOG_FILE_PREFIX) {
                Some(name)
            } else {
                None
            }
        })
        .collect();
    names.sort();
    names
}

fn crash_marker_path(log_dir: &Path) -> PathBuf {
    log_dir.join(CRASH_MARKER)
}

fn take_crash_marker(log_dir: &Path) -> bool {
    let path = crash_marker_path(log_dir);
    if path.exists() {
        let _ = fs::remove_file(&path);
        true
    } else {
        false
    }
}

fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let panic_text = redact_text(&info.to_string());
        if let Some(dir) = LOG_DIR.get() {
            let _ = fs::write(crash_marker_path(dir), &panic_text);
        }
        tracing::error!(panic = %panic_text, "application panic");
        previous(info);
    }));
}

fn prune_old_logs(log_dir: &Path) {
    let Ok(entries) = fs::read_dir(log_dir) else {
        return;
    };
    let mut files: Vec<(SystemTime, u64, std::path::PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.starts_with(LOG_FILE_PREFIX) {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        files.push((modified, meta.len(), path));
    }

    let max_age = Duration::from_secs(LOG_RETENTION_DAYS.saturating_mul(24 * 60 * 60));
    let now = SystemTime::now();
    files.retain(|(modified, _, path)| {
        let aged_out = now
            .duration_since(*modified)
            .map(|d| d > max_age)
            .unwrap_or(false);
        if aged_out {
            let _ = fs::remove_file(path);
            false
        } else {
            true
        }
    });

    files.sort_by_key(|(modified, _, _)| *modified);
    let mut total: u64 = files.iter().map(|(_, len, _)| *len).sum();
    for (_, len, path) in files {
        if total <= LOG_MAX_TOTAL_BYTES {
            break;
        }
        if fs::remove_file(&path).is_ok() {
            total = total.saturating_sub(len);
        }
    }
}
