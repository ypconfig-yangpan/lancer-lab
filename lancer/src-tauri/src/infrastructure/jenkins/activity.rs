//! Poll Jenkins queue + executors (Webhook 丢事件时的兜底) and emit events.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tracing::{debug, warn};

use super::client::JenkinsClient;
use super::events::{
    JenkinsBuildEventDto, JenkinsBuildEventKind, JenkinsEventSource, JENKINS_BUILD_EVENT,
};

pub const JENKINS_ACTIVITY_EVENT: &str = "jenkins-activity";

const POLL_INTERVAL: Duration = Duration::from_millis(1_500);

#[derive(Clone, Default)]
pub struct JenkinsActivityListenManager {
    generation: Arc<AtomicU64>,
    handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl JenkinsActivityListenManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn start(&self, app: AppHandle, jenkins: JenkinsClient) {
        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        {
            let mut guard = self.handle.lock().await;
            if let Some(prev) = guard.take() {
                prev.abort();
            }
            let manager_gen = Arc::clone(&self.generation);
            let handle = tokio::spawn(async move {
                run_loop(app, jenkins, manager_gen, gen).await;
            });
            *guard = Some(handle);
        }
        debug!(target: "lancer::jenkins", generation = gen, "jenkins activity poll fallback started");
    }

    pub async fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        let mut guard = self.handle.lock().await;
        if let Some(prev) = guard.take() {
            prev.abort();
        }
        debug!(target: "lancer::jenkins", "jenkins activity poll fallback stopped");
    }
}

async fn run_loop(
    app: AppHandle,
    jenkins: JenkinsClient,
    generation: Arc<AtomicU64>,
    my_gen: u64,
) {
    let mut last_fp = String::new();
    let mut prev_running: HashSet<(String, i64)> = HashSet::new();
    let mut prev_queue: HashSet<i64> = HashSet::new();
    let mut primed = false;

    loop {
        if generation.load(Ordering::SeqCst) != my_gen {
            break;
        }
        match jenkins.activity_snapshot().await {
            Ok(snapshot) => {
                let cur_running: HashSet<(String, i64)> = snapshot
                    .executors
                    .running
                    .iter()
                    .filter(|r| !r.job_full_name.is_empty() && r.number > 0)
                    .map(|r| (r.job_full_name.clone(), r.number))
                    .collect();
                let cur_queue: HashSet<i64> = snapshot.queue.iter().map(|q| q.id).collect();

                if primed {
                    for (job, number) in cur_running.difference(&prev_running) {
                        emit_build(
                            &app,
                            JenkinsBuildEventDto {
                                kind: JenkinsBuildEventKind::BuildStarted,
                                job_full_name: job.clone(),
                                number: Some(*number),
                                result: Some("RUNNING".into()),
                                duration_ms: None,
                                source: JenkinsEventSource::Poll,
                                message: format!("{job} #{number} started"),
                            },
                        );
                    }

                    for (job, number) in prev_running.difference(&cur_running) {
                        let (result, duration_ms) =
                            match jenkins.get_build(job, *number).await {
                                Ok(detail) => (
                                    Some(if detail.building {
                                        "RUNNING".into()
                                    } else {
                                        detail.result
                                    }),
                                    Some(detail.duration_ms),
                                ),
                                Err(_) => (None, None),
                            };
                        let label = result.clone().unwrap_or_else(|| "COMPLETED".into());
                        emit_build(
                            &app,
                            JenkinsBuildEventDto {
                                kind: JenkinsBuildEventKind::BuildCompleted,
                                job_full_name: job.clone(),
                                number: Some(*number),
                                result,
                                duration_ms,
                                source: JenkinsEventSource::Poll,
                                message: format!("{job} #{number} {label}"),
                            },
                        );
                    }

                    // 新入队
                    let queue_by_id: HashMap<i64, _> =
                        snapshot.queue.iter().map(|q| (q.id, q)).collect();
                    for id in cur_queue.difference(&prev_queue) {
                        if let Some(item) = queue_by_id.get(id) {
                            let job = if item.task_full_name.is_empty() {
                                item.task_name.clone()
                            } else {
                                item.task_full_name.clone()
                            };
                            if !job.is_empty() {
                                emit_build(
                                    &app,
                                    JenkinsBuildEventDto {
                                        kind: JenkinsBuildEventKind::BuildQueued,
                                        job_full_name: job.clone(),
                                        number: None,
                                        result: None,
                                        duration_ms: None,
                                        source: JenkinsEventSource::Poll,
                                        message: format!("{job} queued"),
                                    },
                                );
                            }
                        }
                    }
                }

                prev_running = cur_running;
                prev_queue = cur_queue;
                primed = true;

                if snapshot.fingerprint != last_fp {
                    last_fp = snapshot.fingerprint.clone();
                    if let Err(err) = app.emit(JENKINS_ACTIVITY_EVENT, &snapshot) {
                        warn!(
                            target: "lancer::jenkins",
                            error = %err,
                            "failed to emit jenkins activity"
                        );
                    }
                }
            }
            Err(err) => {
                debug!(
                    target: "lancer::jenkins",
                    error = %err,
                    "jenkins activity poll failed"
                );
            }
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

fn emit_build(app: &AppHandle, event: JenkinsBuildEventDto) {
    if let Err(err) = app.emit(JENKINS_BUILD_EVENT, &event) {
        warn!(
            target: "lancer::jenkins",
            error = %err,
            "failed to emit jenkins build event"
        );
    } else {
        debug!(
            target: "lancer::jenkins",
            kind = ?event.kind,
            job = %event.job_full_name,
            source = ?event.source,
            "jenkins build event"
        );
    }
}
