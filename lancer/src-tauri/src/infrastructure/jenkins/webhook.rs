//! Local HTTP webhook ingress for Jenkins notifications (fallback = poll).

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tracing::{debug, info, warn};

use super::events::{
    JenkinsBuildEventDto, JenkinsBuildEventKind, JenkinsEventSource, JENKINS_BUILD_EVENT,
};

const DEFAULT_PORT: u16 = 18765;

#[derive(Debug, Clone)]
pub struct JenkinsWebhookListenConfig {
    pub enabled: bool,
    pub port: u16,
    pub token: Option<String>,
}

impl Default for JenkinsWebhookListenConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            port: DEFAULT_PORT,
            token: None,
        }
    }
}

#[derive(Clone, Default)]
pub struct JenkinsWebhookListenManager {
    generation: Arc<AtomicU64>,
    handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl JenkinsWebhookListenManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn start(&self, app: AppHandle, cfg: JenkinsWebhookListenConfig) {
        self.stop().await;
        if !cfg.enabled {
            debug!(target: "lancer::jenkins", "jenkins webhook listen disabled");
            return;
        }
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let generation = Arc::clone(&self.generation);
        let handle = tokio::spawn(async move {
            run_server(app, cfg, generation, gen).await;
        });
        *self.handle.lock().await = Some(handle);
    }

    pub async fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Some(prev) = self.handle.lock().await.take() {
            prev.abort();
        }
    }
}

async fn run_server(
    app: AppHandle,
    cfg: JenkinsWebhookListenConfig,
    generation: Arc<AtomicU64>,
    my_gen: u64,
) {
    let bind = format!("127.0.0.1:{}", cfg.port);
    let listener = match TcpListener::bind(&bind).await {
        Ok(l) => l,
        Err(err) => {
            warn!(
                target: "lancer::jenkins",
                error = %err,
                %bind,
                "jenkins webhook bind failed"
            );
            return;
        }
    };
    info!(target: "lancer::jenkins", %bind, "jenkins webhook listening");

    loop {
        if generation.load(Ordering::SeqCst) != my_gen {
            break;
        }
        match tokio::time::timeout(Duration::from_millis(500), listener.accept()).await {
            Ok(Ok((mut socket, _))) => {
                let app = app.clone();
                let token = cfg.token.clone();
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 64 * 1024];
                    let n = match socket.read(&mut buf).await {
                        Ok(0) | Err(_) => return,
                        Ok(n) => n,
                    };
                    let raw = String::from_utf8_lossy(&buf[..n]);
                    let (status, body) = handle_http(&app, &token, &raw);
                    let resp = format!(
                        "HTTP/1.1 {status}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    );
                    let _ = socket.write_all(resp.as_bytes()).await;
                });
            }
            Ok(Err(err)) => {
                warn!(target: "lancer::jenkins", error = %err, "jenkins webhook accept failed");
                break;
            }
            Err(_) => {}
        }
    }
}

fn handle_http(app: &AppHandle, token: &Option<String>, raw: &str) -> (u16, &'static str) {
    let Some((head, body)) = raw.split_once("\r\n\r\n") else {
        return (400, "bad request");
    };
    let mut lines = head.lines();
    let Some(req_line) = lines.next() else {
        return (400, "bad request");
    };
    let parts: Vec<&str> = req_line.split_whitespace().collect();
    if parts.len() < 2 || parts[0] != "POST" {
        return (405, "method not allowed");
    }
    let path_q = parts[1];
    let path = path_q.split('?').next().unwrap_or(path_q);
    if path != "/jenkins/webhook" && path != "/webhook/jenkins" {
        return (404, "not found");
    }

    if let Some(expected) = token {
        let mut ok = false;
        for line in lines {
            let lower = line.to_ascii_lowercase();
            if let Some(v) = lower.strip_prefix("x-lancer-token:") {
                if v.trim() == expected {
                    ok = true;
                    break;
                }
            }
            if let Some(v) = lower.strip_prefix("authorization:") {
                let v = v.trim();
                if v == expected || v.strip_prefix("bearer ").is_some_and(|t| t == expected) {
                    ok = true;
                    break;
                }
            }
        }
        if !ok {
            if let Some(q) = path_q.split_once('?').map(|(_, q)| q) {
                for pair in q.split('&') {
                    if let Some(v) = pair.strip_prefix("token=") {
                        if v == expected {
                            ok = true;
                        }
                    }
                }
            }
        }
        if !ok {
            return (401, "unauthorized");
        }
    }

    match parse_webhook_body(body) {
        Some(event) => {
            if let Err(err) = app.emit(JENKINS_BUILD_EVENT, &event) {
                warn!(target: "lancer::jenkins", error = %err, "emit webhook build event failed");
                return (500, "emit failed");
            }
            debug!(
                target: "lancer::jenkins",
                job = %event.job_full_name,
                kind = ?event.kind,
                "jenkins webhook event accepted"
            );
            (200, "ok")
        }
        None => (400, "unrecognized payload"),
    }
}

#[derive(Debug, Deserialize)]
struct LancerWebhookBody {
    event: Option<String>,
    #[serde(alias = "jobFullName", alias = "job")]
    job_full_name: Option<String>,
    name: Option<String>,
    number: Option<i64>,
    result: Option<String>,
    status: Option<String>,
    #[serde(alias = "durationMs")]
    duration_ms: Option<i64>,
    build: Option<NotificationBuild>,
}

#[derive(Debug, Deserialize)]
struct NotificationBuild {
    number: Option<i64>,
    status: Option<String>,
    phase: Option<String>,
    duration: Option<i64>,
}

fn parse_webhook_body(body: &str) -> Option<JenkinsBuildEventDto> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed: LancerWebhookBody = serde_json::from_str(trimmed).ok()?;

    let job = parsed
        .job_full_name
        .or(parsed.name)
        .filter(|s| !s.is_empty())?;

    let number = parsed
        .number
        .or_else(|| parsed.build.as_ref().and_then(|b| b.number));

    let status = parsed
        .status
        .or(parsed.result)
        .or_else(|| parsed.build.as_ref().and_then(|b| b.status.clone()))
        .or_else(|| parsed.build.as_ref().and_then(|b| b.phase.clone()))
        .or(parsed.event)
        .unwrap_or_default();

    let status_upper = status.to_ascii_uppercase();
    let (kind, result) = classify_status(&status_upper);

    let duration_ms = parsed.duration_ms.or_else(|| {
        parsed
            .build
            .as_ref()
            .and_then(|b| b.duration)
            .map(|d| if d < 10_000 { d * 1000 } else { d })
    });

    let message = match kind {
        JenkinsBuildEventKind::BuildQueued => format!("{job} queued"),
        JenkinsBuildEventKind::BuildStarted => {
            if let Some(n) = number {
                format!("{job} #{n} started")
            } else {
                format!("{job} started")
            }
        }
        JenkinsBuildEventKind::BuildCompleted => {
            let r = result.clone().unwrap_or_else(|| "COMPLETED".into());
            if let Some(n) = number {
                format!("{job} #{n} {r}")
            } else {
                format!("{job} {r}")
            }
        }
    };

    Some(JenkinsBuildEventDto {
        kind,
        job_full_name: job,
        number,
        result,
        duration_ms,
        source: JenkinsEventSource::Webhook,
        message,
    })
}

fn classify_status(status: &str) -> (JenkinsBuildEventKind, Option<String>) {
    match status {
        "QUEUED" | "BUILDQUEUED" | "QUEUE" => (JenkinsBuildEventKind::BuildQueued, None),
        "STARTED" | "START" | "RUNNING" | "BUILDSTARTED" | "IN_PROGRESS" | "INPROGRESS" => {
            (JenkinsBuildEventKind::BuildStarted, Some("RUNNING".into()))
        }
        "SUCCESS" | "FAILURE" | "ABORTED" | "UNSTABLE" | "NOT_BUILT" | "COMPLETED"
        | "FINALIZED" | "FINISHED" | "BUILDCOMPLETED" => {
            let result = match status {
                "COMPLETED" | "FINALIZED" | "FINISHED" | "BUILDCOMPLETED" => None,
                other => Some(other.to_string()),
            };
            (JenkinsBuildEventKind::BuildCompleted, result)
        }
        other if other.contains("FAIL") => {
            (JenkinsBuildEventKind::BuildCompleted, Some("FAILURE".into()))
        }
        other if other.contains("SUCCESS") => {
            (JenkinsBuildEventKind::BuildCompleted, Some("SUCCESS".into()))
        }
        _ => (JenkinsBuildEventKind::BuildStarted, Some("RUNNING".into())),
    }
}
