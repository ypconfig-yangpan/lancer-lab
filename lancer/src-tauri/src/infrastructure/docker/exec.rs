//! Interactive Docker container exec (TTY). Not host shell.

use std::collections::HashMap;
use std::sync::Arc;

use bollard::exec::{CreateExecOptions, ResizeExecOptions, StartExecOptions, StartExecResults};
use futures_util::StreamExt;
use serde::Serialize;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, Mutex};
use tracing::{debug, info, warn};

use crate::domain::error::AppError;
use crate::domain::operation::OperationId;

use super::{map_bollard_error, DockerEngine};

pub const DOCKER_EXEC_OUTPUT_EVENT: &str = "docker-exec-output";
pub const DOCKER_EXEC_CLOSED_EVENT: &str = "docker-exec-closed";

const MAX_SESSIONS: usize = 4;
const DEFAULT_SHELL: &str = "/bin/sh";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerExecSessionDto {
    pub session_id: String,
    pub container_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerExecOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerExecClosedPayload {
    pub session_id: String,
    pub reason: String,
}

struct SessionState {
    container_id: String,
    exec_id: String,
    stdin_tx: mpsc::Sender<Vec<u8>>,
    abort: tokio::task::AbortHandle,
    status: String,
}

#[derive(Clone, Default)]
pub struct DockerExecManager {
    sessions: Arc<Mutex<HashMap<String, SessionState>>>,
}

impl DockerExecManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn open(
        &self,
        app: tauri::AppHandle,
        container_id: String,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<DockerExecSessionDto, AppError> {
        let container_id = container_id.trim().to_string();
        if container_id.is_empty() {
            return Err(AppError::coded(
                "TERMINAL_OPEN_FAILED",
                "container id is required",
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

        let docker = DockerEngine::connect()?;
        let create = docker
            .create_exec(
                &container_id,
                CreateExecOptions {
                    attach_stdin: Some(true),
                    attach_stdout: Some(true),
                    attach_stderr: Some(true),
                    tty: Some(true),
                    cmd: Some(vec![DEFAULT_SHELL.to_string()]),
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| map_exec_open_error(e))?;

        let exec_id = create.id;
        let started = docker
            .start_exec(
                &exec_id,
                Some(StartExecOptions {
                    detach: false,
                    tty: true,
                    ..Default::default()
                }),
            )
            .await
            .map_err(|e| map_exec_open_error(e))?;

        let StartExecResults::Attached { mut output, mut input } = started else {
            return Err(AppError::coded(
                "TERMINAL_OPEN_FAILED",
                "exec started detached; expected attached TTY",
                None,
                false,
            ));
        };

        let cols = cols.unwrap_or(80).max(1);
        let rows = rows.unwrap_or(24).max(1);
        if let Err(err) = docker
            .resize_exec(
                &exec_id,
                ResizeExecOptions {
                    width: cols,
                    height: rows,
                },
            )
            .await
        {
            debug!(
                target: "lancer::docker",
                exec_id = %exec_id,
                error = %err,
                "initial resize skipped"
            );
        }

        let session_id = format!("dexec_{}", OperationId::generate());
        let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(64);

        let write_join = tokio::spawn(async move {
            while let Some(chunk) = stdin_rx.recv().await {
                if input.write_all(&chunk).await.is_err() {
                    break;
                }
                if input.flush().await.is_err() {
                    break;
                }
            }
        });

        let sessions = self.sessions.clone();
        let sid = session_id.clone();
        let app_out = app.clone();
        let read_join = tokio::spawn(async move {
            while let Some(item) = output.next().await {
                match item {
                    Ok(chunk) => {
                        let data = String::from_utf8_lossy(chunk.as_ref()).into_owned();
                        if data.is_empty() {
                            continue;
                        }
                        let _ = app_out.emit(
                            DOCKER_EXEC_OUTPUT_EVENT,
                            DockerExecOutputPayload {
                                session_id: sid.clone(),
                                data,
                            },
                        );
                    }
                    Err(err) => {
                        warn!(
                            target: "lancer::docker",
                            session_id = %sid,
                            error = %err,
                            "exec output stream error"
                        );
                        break;
                    }
                }
            }

            write_join.abort();
            {
                let mut guard = sessions.lock().await;
                if let Some(session) = guard.get_mut(&sid) {
                    session.status = "closed".to_string();
                }
                guard.remove(&sid);
            }
            let _ = app_out.emit(
                DOCKER_EXEC_CLOSED_EVENT,
                DockerExecClosedPayload {
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
                    container_id: container_id.clone(),
                    exec_id: exec_id.clone(),
                    stdin_tx,
                    abort: read_join.abort_handle(),
                    status: "open".to_string(),
                },
            );
        }

        info!(
            target: "lancer::docker",
            session_id = %session_id,
            container_id = %container_id,
            exec_id = %exec_id,
            "docker exec session opened"
        );

        Ok(DockerExecSessionDto {
            session_id,
            container_id,
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
            AppError::coded(
                "TERMINAL_DISCONNECTED",
                "exec stdin closed",
                None,
                true,
            )
        })?;
        Ok(())
    }

    pub async fn resize(
        &self,
        session_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), AppError> {
        let exec_id = {
            let guard = self.sessions.lock().await;
            let session = guard.get(session_id).ok_or_else(|| {
                AppError::coded(
                    "TERMINAL_DISCONNECTED",
                    format!("exec session not found: {session_id}"),
                    None,
                    true,
                )
            })?;
            session.exec_id.clone()
        };
        let docker = DockerEngine::connect()?;
        docker
            .resize_exec(
                &exec_id,
                ResizeExecOptions {
                    width: cols.max(1),
                    height: rows.max(1),
                },
            )
            .await
            .map_err(map_bollard_error)?;
        Ok(())
    }

    pub async fn close(&self, app: Option<&tauri::AppHandle>, session_id: &str) -> Result<(), AppError> {
        let removed = {
            let mut guard = self.sessions.lock().await;
            guard.remove(session_id)
        };
        if let Some(session) = removed {
            session.abort.abort();
            if let Some(app) = app {
                let _ = app.emit(
                    DOCKER_EXEC_CLOSED_EVENT,
                    DockerExecClosedPayload {
                        session_id: session_id.to_string(),
                        reason: "closed".to_string(),
                    },
                );
            }
            debug!(
                target: "lancer::docker",
                session_id = %session_id,
                container_id = %session.container_id,
                "docker exec session closed"
            );
            Ok(())
        } else {
            Ok(())
        }
    }

    pub async fn clear_all(&self) {
        let ids: Vec<String> = {
            let guard = self.sessions.lock().await;
            guard.keys().cloned().collect()
        };
        for id in ids {
            let _ = self.close(None, &id).await;
        }
    }
}

fn map_exec_open_error(err: bollard::errors::Error) -> AppError {
    let mapped = map_bollard_error(err);
    match &mapped {
        AppError::Coded { code, message, detail, retryable } => {
            if *code == "DOCKER_UNAVAILABLE" {
                mapped
            } else {
                AppError::coded(
                    "TERMINAL_OPEN_FAILED",
                    message.clone(),
                    detail.clone(),
                    *retryable,
                )
            }
        }
    }
}
