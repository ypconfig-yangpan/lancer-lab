//! Interactive Kubernetes Pod exec (TTY). Not host shell.

use std::collections::HashMap;
use std::sync::Arc;

use futures_util::SinkExt;
use k8s_openapi::api::core::v1::Pod;
use kube::api::{Api, AttachParams, TerminalSize};
use serde::Serialize;
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, Mutex};
use tracing::{debug, info, warn};

use crate::domain::cluster::ClusterId;
use crate::domain::error::AppError;
use crate::domain::operation::OperationId;
use crate::infrastructure::kubernetes::ClusterClientRegistry;

pub const K8S_EXEC_OUTPUT_EVENT: &str = "k8s-exec-output";
pub const K8S_EXEC_CLOSED_EVENT: &str = "k8s-exec-closed";

const MAX_SESSIONS: usize = 4;
const DEFAULT_SHELL: &str = "/bin/sh";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PodExecSessionDto {
    pub session_id: String,
    pub cluster_id: String,
    pub namespace: String,
    pub pod: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PodExecOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PodExecClosedPayload {
    pub session_id: String,
    pub reason: String,
}

struct SessionState {
    cluster_id: String,
    #[allow(dead_code)]
    namespace: String,
    pod: String,
    stdin_tx: mpsc::Sender<Vec<u8>>,
    resize_tx: Option<mpsc::Sender<TerminalSize>>,
    abort: tokio::task::AbortHandle,
    status: String,
}

#[derive(Clone, Default)]
pub struct PodExecManager {
    sessions: Arc<Mutex<HashMap<String, SessionState>>>,
}

impl PodExecManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn open(
        &self,
        app: tauri::AppHandle,
        clusters: &ClusterClientRegistry,
        cluster_id: String,
        namespace: String,
        pod: String,
        container: Option<String>,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<PodExecSessionDto, AppError> {
        let cluster_id = cluster_id.trim().to_string();
        let namespace = namespace.trim().to_string();
        let pod = pod.trim().to_string();
        if cluster_id.is_empty() || namespace.is_empty() || pod.is_empty() {
            return Err(AppError::coded(
                "TERMINAL_OPEN_FAILED",
                "clusterId, namespace, and pod are required",
                None,
                false,
            ));
        }

        {
            let guard = self.sessions.lock().await;
            if guard.len() >= MAX_SESSIONS {
                return Err(AppError::coded(
                    "TERMINAL_OPEN_FAILED",
                    format!("too many exec sessions (max {MAX_SESSIONS})"),
                    None,
                    true,
                ));
            }
        }

        let cid = ClusterId(cluster_id.clone());
        clusters.ensure_can_exec(&cid).await?;
        let handle = clusters.get(&cid).await?;
        let api: Api<Pod> = Api::namespaced(handle.client, &namespace);

        let mut ap = AttachParams::interactive_tty();
        if let Some(c) = container
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
        {
            ap = ap.container(&c);
        }

        let mut attached = api
            .exec(&pod, vec![DEFAULT_SHELL], &ap)
            .await
            .map_err(map_exec_error)?;

        let mut stdin = attached.stdin().ok_or_else(|| {
            AppError::coded(
                "TERMINAL_OPEN_FAILED",
                "exec stdin unavailable",
                None,
                false,
            )
        })?;
        let mut stdout = attached.stdout().ok_or_else(|| {
            AppError::coded(
                "TERMINAL_OPEN_FAILED",
                "exec stdout unavailable",
                None,
                false,
            )
        })?;
        let mut term_size = attached.terminal_size();

        let cols = cols.unwrap_or(80).max(1);
        let rows = rows.unwrap_or(24).max(1);
        if let Some(ref mut tx) = term_size {
            if let Err(err) = tx
                .send(TerminalSize {
                    width: cols,
                    height: rows,
                })
                .await
            {
                debug!(
                    target: "lancer::k8s",
                    error = %err,
                    "initial terminal resize skipped"
                );
            }
        }

        let session_id = format!("kexec_{}", OperationId::generate());
        let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(64);
        let (resize_tx, mut resize_rx) = mpsc::channel::<TerminalSize>(8);

        let write_join = tokio::spawn(async move {
            while let Some(chunk) = stdin_rx.recv().await {
                if stdin.write_all(&chunk).await.is_err() {
                    break;
                }
                if stdin.flush().await.is_err() {
                    break;
                }
            }
        });

        let resize_join = tokio::spawn(async move {
            let Some(mut term_size) = term_size else {
                return;
            };
            while let Some(size) = resize_rx.recv().await {
                if term_size.send(size).await.is_err() {
                    break;
                }
            }
        });

        let sessions = self.sessions.clone();
        let sid = session_id.clone();
        let app_out = app.clone();
        let read_join = tokio::spawn(async move {
            let mut buf = [0u8; 4096];
            loop {
                match stdout.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        if data.is_empty() {
                            continue;
                        }
                        let _ = app_out.emit(
                            K8S_EXEC_OUTPUT_EVENT,
                            PodExecOutputPayload {
                                session_id: sid.clone(),
                                data,
                            },
                        );
                    }
                    Err(err) => {
                        warn!(
                            target: "lancer::k8s",
                            session_id = %sid,
                            error = %err,
                            "pod exec stdout error"
                        );
                        break;
                    }
                }
            }

            write_join.abort();
            resize_join.abort();
            attached.abort();
            {
                let mut guard = sessions.lock().await;
                if let Some(session) = guard.get_mut(&sid) {
                    session.status = "closed".to_string();
                }
                guard.remove(&sid);
            }
            let _ = app_out.emit(
                K8S_EXEC_CLOSED_EVENT,
                PodExecClosedPayload {
                    session_id: sid,
                    reason: "disconnected".to_string(),
                },
            );
        });

        {
            let mut guard = self.sessions.lock().await;
            guard.insert(
                session_id.clone(),
                SessionState {
                    cluster_id: cluster_id.clone(),
                    namespace: namespace.clone(),
                    pod: pod.clone(),
                    stdin_tx,
                    resize_tx: Some(resize_tx),
                    abort: read_join.abort_handle(),
                    status: "open".to_string(),
                },
            );
        }

        info!(
            target: "lancer::k8s",
            session_id = %session_id,
            cluster_id = %cluster_id,
            namespace = %namespace,
            pod = %pod,
            "pod exec session opened"
        );

        Ok(PodExecSessionDto {
            session_id,
            cluster_id,
            namespace,
            pod,
            status: "open".to_string(),
        })
    }

    pub async fn write(&self, session_id: &str, data: &str) -> Result<(), AppError> {
        let tx = {
            let guard = self.sessions.lock().await;
            let session = guard.get(session_id).ok_or_else(|| {
                AppError::coded(
                    "TERMINAL_DISCONNECTED",
                    format!("exec session not found: {session_id}"),
                    None,
                    true,
                )
            })?;
            session.stdin_tx.clone()
        };
        tx.send(data.as_bytes().to_vec()).await.map_err(|_| {
            AppError::coded("TERMINAL_DISCONNECTED", "exec stdin closed", None, true)
        })?;
        Ok(())
    }

    pub async fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let tx = {
            let guard = self.sessions.lock().await;
            let session = guard.get(session_id).ok_or_else(|| {
                AppError::coded(
                    "TERMINAL_DISCONNECTED",
                    format!("exec session not found: {session_id}"),
                    None,
                    true,
                )
            })?;
            session.resize_tx.clone().ok_or_else(|| {
                AppError::coded(
                    "TERMINAL_DISCONNECTED",
                    "exec resize channel unavailable",
                    None,
                    true,
                )
            })?
        };
        tx.send(TerminalSize {
            width: cols.max(1),
            height: rows.max(1),
        })
        .await
        .map_err(|_| {
            AppError::coded("TERMINAL_DISCONNECTED", "exec resize closed", None, true)
        })?;
        Ok(())
    }

    pub async fn close(
        &self,
        app: Option<&tauri::AppHandle>,
        session_id: &str,
    ) -> Result<(), AppError> {
        let removed = {
            let mut guard = self.sessions.lock().await;
            guard.remove(session_id)
        };
        if let Some(session) = removed {
            session.abort.abort();
            if let Some(app) = app {
                let _ = app.emit(
                    K8S_EXEC_CLOSED_EVENT,
                    PodExecClosedPayload {
                        session_id: session_id.to_string(),
                        reason: "closed".to_string(),
                    },
                );
            }
            debug!(
                target: "lancer::k8s",
                session_id = %session_id,
                cluster_id = %session.cluster_id,
                pod = %session.pod,
                "pod exec session closed"
            );
        }
        Ok(())
    }

    pub async fn clear_all(&self) {
        let mut guard = self.sessions.lock().await;
        for (_, session) in guard.drain() {
            session.abort.abort();
        }
    }
}

fn map_exec_error(err: kube::Error) -> AppError {
    match &err {
        kube::Error::Api(status) if status.code == 403 => AppError::coded(
            "TERMINAL_PERMISSION_DENIED",
            if status.message.is_empty() {
                "forbidden: cannot exec into pod".to_string()
            } else {
                status.message.clone()
            },
            Some(err.to_string()),
            false,
        ),
        kube::Error::Api(status) if status.code == 404 => AppError::not_found(
            if status.message.is_empty() {
                "pod not found".to_string()
            } else {
                status.message.clone()
            },
            Some(err.to_string()),
        ),
        _ => AppError::coded(
            "TERMINAL_OPEN_FAILED",
            format!("pod exec failed: {err}"),
            Some(err.to_string()),
            true,
        ),
    }
}
