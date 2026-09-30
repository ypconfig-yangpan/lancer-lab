use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{Event, Pod, Service};
use kube::api::Api;
use kube::runtime::{watcher, WatchStreamExt};
use kube::Client;
use tokio::sync::{watch, RwLock};
use tokio::task::JoinHandle;
use tracing::{debug, warn};

use crate::domain::cluster::ClusterId;
use crate::domain::error::AppError;
use crate::infrastructure::kubernetes::registry::{
    map_deployment, map_event, map_pod, map_service, ClusterClientRegistry, DeploymentSummaryDto,
    EventSummaryDto, PodSummaryDto, ServiceSummaryDto,
};

pub const RESOURCE_CHANGED_EVENT: &str = "k8s-resource-changed";

#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResourceWatchKind {
    Pod,
    Deployment,
    Service,
    Event,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ResourceWatchAction {
    /// Added or modified (incl. Terminating while deletionTimestamp set).
    Upsert,
    Delete,
    /// Watch reconnect — FE should buffer until ResyncDone.
    ResyncStart,
    /// Replace buffered snapshot into the list cache.
    ResyncDone,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct WatchKey {
    cluster_id: String,
    namespace: String,
    kind: ResourceWatchKind,
}

struct WatchEntry {
    ref_count: u32,
    stop: watch::Sender<bool>,
    task: JoinHandle<()>,
}

/// Rancher-style delta: action + optional mapped object for local cache patch.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceWatchEventPayload {
    pub cluster_id: String,
    pub namespace: String,
    pub kind: ResourceWatchKind,
    pub action: ResourceWatchAction,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pod: Option<PodSummaryDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deployment: Option<DeploymentSummaryDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service: Option<ServiceSummaryDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<EventSummaryDto>,
}

#[derive(Clone, Default)]
pub struct ResourceWatchManager {
    inner: Arc<RwLock<HashMap<WatchKey, WatchEntry>>>,
}

impl ResourceWatchManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn start(
        &self,
        app: tauri::AppHandle,
        clusters: &ClusterClientRegistry,
        cluster_id: String,
        namespace: String,
        kind: ResourceWatchKind,
    ) -> Result<(), AppError> {
        require_namespace(&namespace)?;
        let handle = clusters.get(&ClusterId(cluster_id.clone())).await?;

        let key = WatchKey {
            cluster_id: cluster_id.clone(),
            namespace: namespace.clone(),
            kind: kind.clone(),
        };

        let mut guard = self.inner.write().await;
        if let Some(entry) = guard.get_mut(&key) {
            entry.ref_count += 1;
            debug!(
                target: "lancer::k8s",
                cluster_id = %cluster_id,
                namespace = %namespace,
                kind = ?kind,
                ref_count = entry.ref_count,
                "resource watch refcount incremented"
            );
            return Ok(());
        }

        let (stop_tx, stop_rx) = watch::channel(false);
        let task = tokio::spawn(run_watch_loop(
            app,
            handle.client,
            cluster_id.clone(),
            namespace.clone(),
            kind.clone(),
            stop_rx,
        ));

        guard.insert(
            key,
            WatchEntry {
                ref_count: 1,
                stop: stop_tx,
                task,
            },
        );

        debug!(
            target: "lancer::k8s",
            cluster_id = %cluster_id,
            namespace = %namespace,
            kind = ?kind,
            "resource watch started"
        );
        Ok(())
    }

    pub async fn stop(&self, cluster_id: String, namespace: String, kind: ResourceWatchKind) {
        let key = WatchKey {
            cluster_id,
            namespace,
            kind,
        };

        let mut guard = self.inner.write().await;
        let Some(entry) = guard.get_mut(&key) else {
            return;
        };

        entry.ref_count = entry.ref_count.saturating_sub(1);
        if entry.ref_count > 0 {
            debug!(
                target: "lancer::k8s",
                cluster_id = %key.cluster_id,
                namespace = %key.namespace,
                kind = ?key.kind,
                ref_count = entry.ref_count,
                "resource watch refcount decremented"
            );
            return;
        }

        let entry = guard.remove(&key).expect("watch entry");
        let _ = entry.stop.send(true);
        entry.task.abort();
        debug!(
            target: "lancer::k8s",
            cluster_id = %key.cluster_id,
            namespace = %key.namespace,
            kind = ?key.kind,
            "resource watch stopped"
        );
    }

    pub async fn stop_all_for_cluster(&self, cluster_id: &str) {
        let mut guard = self.inner.write().await;
        let keys: Vec<WatchKey> = guard
            .keys()
            .filter(|key| key.cluster_id == cluster_id)
            .cloned()
            .collect();

        for key in keys {
            if let Some(entry) = guard.remove(&key) {
                let _ = entry.stop.send(true);
                entry.task.abort();
                debug!(
                    target: "lancer::k8s",
                    cluster_id = %key.cluster_id,
                    namespace = %key.namespace,
                    kind = ?key.kind,
                    "resource watch stopped on cluster disconnect"
                );
            }
        }
    }

    pub async fn stop_all(&self) {
        let mut guard = self.inner.write().await;
        for (key, entry) in guard.drain() {
            let _ = entry.stop.send(true);
            entry.task.abort();
            debug!(
                target: "lancer::k8s",
                cluster_id = %key.cluster_id,
                namespace = %key.namespace,
                kind = ?key.kind,
                "resource watch stopped on shutdown"
            );
        }
    }
}

fn require_namespace(namespace: &str) -> Result<(), AppError> {
    if namespace.trim().is_empty() {
        return Err(AppError::namespace_required());
    }
    Ok(())
}

fn emit_payload(app: &tauri::AppHandle, payload: ResourceWatchEventPayload) {
    use tauri::Emitter;
    if let Err(err) = app.emit(RESOURCE_CHANGED_EVENT, payload) {
        warn!(
            target: "lancer::k8s",
            error = %err,
            "failed to emit resource watch event"
        );
    }
}

fn base_payload(
    cluster_id: &str,
    namespace: &str,
    kind: ResourceWatchKind,
    action: ResourceWatchAction,
) -> ResourceWatchEventPayload {
    ResourceWatchEventPayload {
        cluster_id: cluster_id.to_string(),
        namespace: namespace.to_string(),
        kind,
        action,
        pod: None,
        deployment: None,
        service: None,
        event: None,
    }
}

async fn run_watch_loop(
    app: tauri::AppHandle,
    client: Client,
    cluster_id: String,
    namespace: String,
    kind: ResourceWatchKind,
    mut stop_rx: watch::Receiver<bool>,
) {
    let mut retry_delay = Duration::from_secs(1);

    loop {
        if *stop_rx.borrow() {
            return;
        }

        let result = run_watch_stream(
            app.clone(),
            client.clone(),
            cluster_id.clone(),
            namespace.clone(),
            kind.clone(),
            &mut stop_rx,
        )
        .await;

        if *stop_rx.borrow() {
            return;
        }

        if let Err(err) = result {
            warn!(
                target: "lancer::k8s",
                cluster_id = %cluster_id,
                namespace = %namespace,
                kind = ?kind,
                error = %crate::shared::redact::redact_text(&err.to_string()),
                retry_secs = retry_delay.as_secs(),
                "resource watch disconnected"
            );
            tokio::time::sleep(retry_delay).await;
            retry_delay = (retry_delay * 2).min(Duration::from_secs(30));
            continue;
        }

        retry_delay = Duration::from_secs(1);
    }
}

async fn run_watch_stream(
    app: tauri::AppHandle,
    client: Client,
    cluster_id: String,
    namespace: String,
    kind: ResourceWatchKind,
    stop_rx: &mut watch::Receiver<bool>,
) -> Result<(), watcher::Error> {
    let config = watcher::Config::default();

    macro_rules! watch_kind {
        ($api:expr, $map:ident, $field:ident) => {{
            let mut stream = std::pin::pin!(watcher($api, config.clone()).default_backoff());
            loop {
                tokio::select! {
                    changed = stop_rx.changed() => {
                        changed.ok();
                        if *stop_rx.borrow() {
                            return Ok(());
                        }
                    }
                    item = stream.next() => {
                        match item {
                            Some(Ok(ev)) => {
                                match ev {
                                    watcher::Event::Init => {
                                        emit_payload(
                                            &app,
                                            base_payload(
                                                &cluster_id,
                                                &namespace,
                                                kind.clone(),
                                                ResourceWatchAction::ResyncStart,
                                            ),
                                        );
                                    }
                                    watcher::Event::InitDone => {
                                        emit_payload(
                                            &app,
                                            base_payload(
                                                &cluster_id,
                                                &namespace,
                                                kind.clone(),
                                                ResourceWatchAction::ResyncDone,
                                            ),
                                        );
                                    }
                                    watcher::Event::Apply(obj) | watcher::Event::InitApply(obj) => {
                                        let mut payload = base_payload(
                                            &cluster_id,
                                            &namespace,
                                            kind.clone(),
                                            ResourceWatchAction::Upsert,
                                        );
                                        payload.$field = Some($map(obj));
                                        emit_payload(&app, payload);
                                    }
                                    watcher::Event::Delete(obj) => {
                                        let mut payload = base_payload(
                                            &cluster_id,
                                            &namespace,
                                            kind.clone(),
                                            ResourceWatchAction::Delete,
                                        );
                                        payload.$field = Some($map(obj));
                                        emit_payload(&app, payload);
                                    }
                                }
                            }
                            Some(Err(err)) => return Err(err),
                            None => return Ok(()),
                        }
                    }
                }
            }
        }};
    }

    match kind {
        ResourceWatchKind::Pod => {
            let api: Api<Pod> = Api::namespaced(client, &namespace);
            watch_kind!(api, map_pod, pod)
        }
        ResourceWatchKind::Deployment => {
            let api: Api<Deployment> = Api::namespaced(client, &namespace);
            watch_kind!(api, map_deployment, deployment)
        }
        ResourceWatchKind::Service => {
            let api: Api<Service> = Api::namespaced(client, &namespace);
            watch_kind!(api, map_service, service)
        }
        ResourceWatchKind::Event => {
            let api: Api<Event> = Api::namespaced(client, &namespace);
            watch_kind!(api, map_event, event)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watch_key_distinguishes_kind() {
        let a = WatchKey {
            cluster_id: "c1".into(),
            namespace: "default".into(),
            kind: ResourceWatchKind::Pod,
        };
        let b = WatchKey {
            cluster_id: "c1".into(),
            namespace: "default".into(),
            kind: ResourceWatchKind::Deployment,
        };
        assert_ne!(a, b);
    }
}
