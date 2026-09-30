use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use k8s_openapi::api::apps::v1::Deployment;
use k8s_openapi::api::core::v1::{Event, Namespace, Node, Pod, Service};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::api::{DeleteParams, ListParams, Patch, PatchParams};
use kube::config::{KubeConfigOptions, Kubeconfig};
use kube::{Api, Client, Config};
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::domain::cluster::{
    ClusterCapabilities, ClusterId, ClusterIdentity, CredentialMode, EnvironmentRiskLevel,
    KubeContextSummary,
};
use crate::domain::error::AppError;
use crate::domain::operation::OperationId;
use crate::infrastructure::kubernetes::capabilities::probe_capabilities;

#[derive(Clone)]
pub struct ConnectedClusterHandle {
    pub identity: ClusterIdentity,
    pub client: Client,
}

#[derive(Clone, Default)]
pub struct ClusterClientRegistry {
    inner: Arc<RwLock<HashMap<String, ConnectedClusterHandle>>>,
}

impl ClusterClientRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn list_contexts(
        kubeconfig_path: &Path,
    ) -> Result<Vec<KubeContextSummary>, AppError> {
        let kubeconfig = read_kubeconfig(kubeconfig_path)?;
        let current = kubeconfig.current_context.clone().unwrap_or_default();
        let mut out = Vec::with_capacity(kubeconfig.contexts.len());
        for ctx in &kubeconfig.contexts {
            out.push(KubeContextSummary {
                name: ctx.name.clone(),
                cluster: ctx
                    .context
                    .as_ref()
                    .map(|c| c.cluster.clone())
                    .unwrap_or_default(),
                user: ctx
                    .context
                    .as_ref()
                    .and_then(|c| c.user.clone())
                    .unwrap_or_default(),
                namespace: ctx.context.as_ref().and_then(|c| c.namespace.clone()),
                is_current: ctx.name == current,
            });
        }
        Ok(out)
    }

    pub async fn connect(
        &self,
        kubeconfig_path: PathBuf,
        context: String,
        readonly: bool,
        default_namespace: Option<String>,
    ) -> Result<ClusterIdentity, AppError> {
        let mut identity = build_identity(&kubeconfig_path, &context, readonly)?;
        let client = build_client(&kubeconfig_path, &context).await?;

        // Prove reachability without requiring cluster-wide namespace list
        // (Rancher project users often only have access to selected namespaces).
        probe_cluster_reachable(client.clone()).await?;

        // Probe SSAR in the working namespace when known — cluster-scoped false
        // is common for Rancher project-scoped tokens.
        identity.capabilities = probe_capabilities(
            client.clone(),
            readonly,
            default_namespace.as_deref(),
        )
        .await;

        info!(
            target: "lancer::k8s",
            cluster_id = %identity.id,
            context = %identity.context,
            api_server = %identity.api_server,
            readonly = identity.readonly,
            ssar_ok = identity.capabilities.ssar_ok,
            "cluster connected"
        );

        let mut guard = self.inner.write().await;
        guard.insert(
            identity.id.0.clone(),
            ConnectedClusterHandle {
                identity: identity.clone(),
                client,
            },
        );
        Ok(identity)
    }

    /// Gate for write commands (scale/restart/apply/exec).
    pub async fn ensure_writable(&self, cluster_id: &ClusterId) -> Result<(), AppError> {
        let guard = self.inner.read().await;
        let handle = guard
            .get(cluster_id.as_str())
            .ok_or_else(|| AppError::cluster_not_connected(cluster_id))?;
        if handle.identity.readonly {
            return Err(AppError::cluster_readonly(
                "cluster connected in readonly mode; write operations are blocked",
            ));
        }
        Ok(())
    }

    /// Readonly + writable connection for Pod Exec.
    /// SSAR canCreatePodsExec is advisory — Rancher project tokens often fail cluster probes.
    pub async fn ensure_can_exec(&self, cluster_id: &ClusterId) -> Result<(), AppError> {
        self.ensure_writable(cluster_id).await
    }

    pub async fn disconnect(&self, cluster_id: &ClusterId) -> Result<(), AppError> {
        let mut guard = self.inner.write().await;
        if guard.remove(cluster_id.as_str()).is_none() {
            return Err(AppError::cluster_not_connected(cluster_id));
        }
        info!(target: "lancer::k8s", cluster_id = %cluster_id, "cluster disconnected");
        Ok(())
    }

    /// Drop every connected client (app shutdown). Watches must be stopped first.
    pub async fn disconnect_all(&self) {
        let mut guard = self.inner.write().await;
        let count = guard.len();
        guard.clear();
        if count > 0 {
            info!(
                target: "lancer::k8s",
                disconnected = count,
                "all clusters disconnected on shutdown"
            );
        }
    }

    pub async fn get(&self, cluster_id: &ClusterId) -> Result<ConnectedClusterHandle, AppError> {
        let guard = self.inner.read().await;
        guard
            .get(cluster_id.as_str())
            .cloned()
            .ok_or_else(|| AppError::cluster_not_connected(cluster_id))
    }

    pub async fn list_connected(&self) -> Vec<ClusterIdentity> {
        let guard = self.inner.read().await;
        guard.values().map(|c| c.identity.clone()).collect()
    }

    pub async fn list_namespaces(&self, cluster_id: &ClusterId) -> Result<Vec<String>, AppError> {
        let handle = self.get(cluster_id).await?;
        let api: Api<Namespace> = Api::all(handle.client);
        let list = api
            .list(&ListParams::default())
            .await
            .map_err(map_kube_error)?;
        let mut names: Vec<String> = list
            .items
            .into_iter()
            .filter_map(|ns| ns.metadata.name)
            .collect();
        names.sort();
        Ok(names)
    }

    pub async fn list_pods(
        &self,
        cluster_id: &ClusterId,
        namespace: &str,
    ) -> Result<Vec<PodSummaryDto>, AppError> {
        require_namespace(namespace)?;
        let handle = self.get(cluster_id).await?;
        let api: Api<Pod> = Api::namespaced(handle.client, namespace);
        let list = api
            .list(&ListParams::default())
            .await
            .map_err(map_kube_error)?;

        Ok(list.items.into_iter().map(map_pod).collect())
    }

    pub async fn list_deployments(
        &self,
        cluster_id: &ClusterId,
        namespace: &str,
    ) -> Result<Vec<DeploymentSummaryDto>, AppError> {
        require_namespace(namespace)?;
        let handle = self.get(cluster_id).await?;
        let api: Api<Deployment> = Api::namespaced(handle.client, namespace);
        let list = api
            .list(&ListParams::default())
            .await
            .map_err(map_kube_error)?;

        Ok(list.items.into_iter().map(map_deployment).collect())
    }

    pub async fn scale_deployment(
        &self,
        cluster_id: &ClusterId,
        namespace: &str,
        name: &str,
        replicas: i32,
    ) -> Result<ScaleDeploymentResultDto, AppError> {
        require_namespace(namespace)?;
        if name.trim().is_empty() {
            return Err(AppError::not_found("deployment name is required", None));
        }
        if !(0..=10_000).contains(&replicas) {
            return Err(AppError::coded(
                "K8S_API_ERROR",
                "replicas must be between 0 and 10000",
                None,
                false,
            ));
        }
        self.ensure_writable(cluster_id).await?;
        let handle = self.get(cluster_id).await?;
        let api: Api<Deployment> = Api::namespaced(handle.client, namespace);
        let current = api.get(name).await.map_err(map_kube_error)?;
        let previous = current
            .spec
            .as_ref()
            .and_then(|s| s.replicas)
            .unwrap_or(0);
        let operation_id = OperationId::generate();
        let patch = json!({ "spec": { "replicas": replicas } });
        api.patch(name, &PatchParams::default(), &Patch::Merge(&patch))
            .await
            .map_err(map_kube_error)?;
        info!(
            target: "lancer::k8s",
            operation_id = %operation_id,
            cluster_id = %cluster_id,
            namespace = %namespace,
            name = %name,
            previous_replicas = previous,
            replicas,
            "deployment scaled"
        );
        Ok(ScaleDeploymentResultDto {
            operation_id: operation_id.0,
            name: name.to_string(),
            namespace: namespace.to_string(),
            previous_replicas: previous,
            replicas,
        })
    }

    pub async fn restart_deployment(
        &self,
        cluster_id: &ClusterId,
        namespace: &str,
        name: &str,
    ) -> Result<RestartDeploymentResultDto, AppError> {
        require_namespace(namespace)?;
        if name.trim().is_empty() {
            return Err(AppError::not_found("deployment name is required", None));
        }
        self.ensure_writable(cluster_id).await?;
        let handle = self.get(cluster_id).await?;
        let api: Api<Deployment> = Api::namespaced(handle.client, namespace);
        // Ensure exists before patch.
        let _ = api.get(name).await.map_err(map_kube_error)?;
        let operation_id = OperationId::generate();
        let restarted_at = Utc::now().to_rfc3339();
        let patch = json!({
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": restarted_at
                        }
                    }
                }
            }
        });
        api.patch(name, &PatchParams::default(), &Patch::Strategic(&patch))
            .await
            .map_err(map_kube_error)?;
        info!(
            target: "lancer::k8s",
            operation_id = %operation_id,
            cluster_id = %cluster_id,
            namespace = %namespace,
            name = %name,
            "deployment restarted"
        );
        Ok(RestartDeploymentResultDto {
            operation_id: operation_id.0,
            name: name.to_string(),
            namespace: namespace.to_string(),
            restarted_at,
        })
    }

    pub async fn update_deployment_image(
        &self,
        cluster_id: &ClusterId,
        namespace: &str,
        name: &str,
        image: &str,
        container: Option<&str>,
    ) -> Result<UpdateDeploymentImageResultDto, AppError> {
        require_namespace(namespace)?;
        if name.trim().is_empty() {
            return Err(AppError::not_found("deployment name is required", None));
        }
        let image = image.trim();
        if image.is_empty() {
            return Err(AppError::coded(
                "K8S_API_ERROR",
                "image is required",
                None,
                false,
            ));
        }
        self.ensure_writable(cluster_id).await?;
        let handle = self.get(cluster_id).await?;
        let api: Api<Deployment> = Api::namespaced(handle.client, namespace);
        let current = api.get(name).await.map_err(map_kube_error)?;
        let containers = current
            .spec
            .as_ref()
            .and_then(|s| s.template.spec.as_ref())
            .map(|pod| pod.containers.as_slice())
            .unwrap_or(&[]);
        if containers.is_empty() {
            return Err(AppError::coded(
                "K8S_API_ERROR",
                "deployment has no containers",
                None,
                false,
            ));
        }
        let target = match container.map(str::trim).filter(|c| !c.is_empty()) {
            Some(wanted) => containers
                .iter()
                .find(|c| c.name == wanted)
                .ok_or_else(|| {
                    AppError::not_found(format!("container '{wanted}' not found"), None)
                })?,
            None => &containers[0],
        };
        let container_name = target.name.clone();
        let previous_image = target.image.clone().unwrap_or_default();
        let operation_id = OperationId::generate();
        let patch = json!({
            "spec": {
                "template": {
                    "spec": {
                        "containers": [{
                            "name": container_name,
                            "image": image
                        }]
                    }
                }
            }
        });
        api.patch(name, &PatchParams::default(), &Patch::Strategic(&patch))
            .await
            .map_err(map_kube_error)?;
        info!(
            target: "lancer::k8s",
            operation_id = %operation_id,
            cluster_id = %cluster_id,
            namespace = %namespace,
            name = %name,
            container = %container_name,
            previous_image = %previous_image,
            image = %image,
            "deployment image updated"
        );
        Ok(UpdateDeploymentImageResultDto {
            operation_id: operation_id.0,
            name: name.to_string(),
            namespace: namespace.to_string(),
            container: container_name,
            previous_image,
            image: image.to_string(),
        })
    }

    pub async fn delete_deployment(
        &self,
        cluster_id: &ClusterId,
        namespace: &str,
        name: &str,
    ) -> Result<DeleteDeploymentResultDto, AppError> {
        require_namespace(namespace)?;
        if name.trim().is_empty() {
            return Err(AppError::not_found("deployment name is required", None));
        }
        self.ensure_writable(cluster_id).await?;
        let handle = self.get(cluster_id).await?;
        let api: Api<Deployment> = Api::namespaced(handle.client, namespace);
        // Ensure exists before delete.
        let _ = api.get(name).await.map_err(map_kube_error)?;
        let operation_id = OperationId::generate();
        api.delete(name, &DeleteParams::default())
            .await
            .map_err(map_kube_error)?;
        info!(
            target: "lancer::k8s",
            operation_id = %operation_id,
            cluster_id = %cluster_id,
            namespace = %namespace,
            name = %name,
            "deployment deleted"
        );
        Ok(DeleteDeploymentResultDto {
            operation_id: operation_id.0,
            name: name.to_string(),
            namespace: namespace.to_string(),
        })
    }

    pub async fn list_services(
        &self,
        cluster_id: &ClusterId,
        namespace: &str,
    ) -> Result<Vec<ServiceSummaryDto>, AppError> {
        require_namespace(namespace)?;
        let handle = self.get(cluster_id).await?;
        let api: Api<Service> = Api::namespaced(handle.client, namespace);
        let list = api
            .list(&ListParams::default())
            .await
            .map_err(map_kube_error)?;

        Ok(list.items.into_iter().map(map_service).collect())
    }

    pub async fn list_events(
        &self,
        cluster_id: &ClusterId,
        namespace: &str,
    ) -> Result<Vec<EventSummaryDto>, AppError> {
        require_namespace(namespace)?;
        let handle = self.get(cluster_id).await?;
        let api: Api<Event> = Api::namespaced(handle.client, namespace);
        let list = api
            .list(&ListParams::default())
            .await
            .map_err(map_kube_error)?;

        let mut rows: Vec<EventSummaryDto> = list.items.into_iter().map(map_event).collect();
        // Newest first — Events are short-lived facts, not a history store.
        rows.sort_by(|a, b| b.last_timestamp.cmp(&a.last_timestamp));
        Ok(rows)
    }

    pub async fn get_resource_yaml(
        &self,
        cluster_id: &ClusterId,
        namespace: &str,
        kind: ManifestResourceKind,
        name: &str,
    ) -> Result<ResourceYamlDto, AppError> {
        require_namespace(namespace)?;
        if name.trim().is_empty() {
            return Err(AppError::not_found("resource name is required", None));
        }
        let handle = self.get(cluster_id).await?;
        match kind {
            ManifestResourceKind::Pod => {
                let api: Api<Pod> = Api::namespaced(handle.client, namespace);
                let mut obj = api.get(name).await.map_err(map_kube_error)?;
                let rv = obj.metadata.resource_version.clone();
                strip_managed_fields(&mut obj.metadata);
                to_yaml_dto(&obj, rv)
            }
            ManifestResourceKind::Deployment => {
                let api: Api<Deployment> = Api::namespaced(handle.client, namespace);
                let mut obj = api.get(name).await.map_err(map_kube_error)?;
                let rv = obj.metadata.resource_version.clone();
                strip_managed_fields(&mut obj.metadata);
                to_yaml_dto(&obj, rv)
            }
            ManifestResourceKind::Service => {
                let api: Api<Service> = Api::namespaced(handle.client, namespace);
                let mut obj = api.get(name).await.map_err(map_kube_error)?;
                let rv = obj.metadata.resource_version.clone();
                strip_managed_fields(&mut obj.metadata);
                to_yaml_dto(&obj, rv)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ManifestResourceKind {
    Pod,
    Deployment,
    Service,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceYamlDto {
    pub yaml: String,
    pub resource_version: String,
}

fn strip_managed_fields(meta: &mut ObjectMeta) {
    meta.managed_fields = None;
}

fn to_yaml_dto<T: serde::Serialize>(
    obj: &T,
    resource_version: Option<String>,
) -> Result<ResourceYamlDto, AppError> {
    let yaml = serde_yaml::to_string(obj).map_err(|err| {
        AppError::api_error(
            "failed to serialize resource as yaml",
            Some(err.to_string()),
        )
    })?;
    Ok(ResourceYamlDto {
        yaml,
        resource_version: resource_version.unwrap_or_default(),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PodSummaryDto {
    pub uid: String,
    pub name: String,
    pub namespace: String,
    pub phase: String,
    pub ready: String,
    pub restarts: i32,
    pub node_name: String,
    pub pod_ip: String,
    pub image: String,
    pub created_at: String,
    pub labels: std::collections::BTreeMap<String, String>,
    pub containers: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentSummaryDto {
    pub uid: String,
    pub name: String,
    pub namespace: String,
    pub ready: String,
    /// Desired replicas from spec (fallback status).
    pub replicas: i32,
    pub up_to_date: i32,
    pub available: i32,
    pub image: String,
    pub created_at: String,
    /// Annotation `kubectl.kubernetes.io/restartedAt` when present.
    pub restarted_at: String,
    pub match_labels: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleDeploymentResultDto {
    pub operation_id: String,
    pub name: String,
    pub namespace: String,
    pub previous_replicas: i32,
    pub replicas: i32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestartDeploymentResultDto {
    pub operation_id: String,
    pub name: String,
    pub namespace: String,
    /// Same value written to kubectl.kubernetes.io/restartedAt.
    pub restarted_at: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDeploymentImageResultDto {
    pub operation_id: String,
    pub name: String,
    pub namespace: String,
    pub container: String,
    pub previous_image: String,
    pub image: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDeploymentResultDto {
    pub operation_id: String,
    pub name: String,
    pub namespace: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceSummaryDto {
    pub uid: String,
    pub name: String,
    pub namespace: String,
    pub service_type: String,
    pub cluster_ip: String,
    pub ports: String,
    pub created_at: String,
    pub selector: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSummaryDto {
    pub uid: String,
    pub name: String,
    pub namespace: String,
    pub event_type: String,
    pub reason: String,
    pub message: String,
    pub count: i32,
    pub involved_kind: String,
    pub involved_name: String,
    pub source: String,
    pub first_timestamp: String,
    pub last_timestamp: String,
}

fn require_namespace(namespace: &str) -> Result<(), AppError> {
    if namespace.trim().is_empty() {
        return Err(AppError::namespace_required());
    }
    Ok(())
}

pub(crate) fn map_pod(pod: Pod) -> PodSummaryDto {
    let meta = pod.metadata;
    let status = pod.status.unwrap_or_default();
    let spec = pod.spec.unwrap_or_default();
    let container_statuses = status.container_statuses.unwrap_or_default();
    let ready_count = container_statuses.iter().filter(|c| c.ready).count();
    let total = container_statuses.len().max(spec.containers.len());
    let restarts = container_statuses
        .iter()
        .map(|c| c.restart_count)
        .sum::<i32>();
    let containers = spec
        .containers
        .iter()
        .map(|c| c.name.clone())
        .collect::<Vec<_>>();
    let image = container_statuses
        .iter()
        .find(|c| !c.image.is_empty())
        .map(|c| c.image.clone())
        .or_else(|| {
            spec.containers.iter().find_map(|c| {
                let img = c.image.clone().unwrap_or_default();
                if img.is_empty() {
                    None
                } else {
                    Some(img)
                }
            })
        })
        .unwrap_or_default();
    let labels = meta.labels.unwrap_or_default().into_iter().collect();
    // Rancher-style: deletionTimestamp set ⇒ Terminating (phase stays Running).
    let phase = if meta.deletion_timestamp.is_some() {
        "Terminating".to_string()
    } else {
        status.phase.unwrap_or_else(|| "Unknown".into())
    };

    PodSummaryDto {
        uid: meta
            .uid
            .unwrap_or_else(|| meta.name.clone().unwrap_or_default()),
        name: meta.name.unwrap_or_default(),
        namespace: meta.namespace.unwrap_or_default(),
        phase,
        ready: format!("{ready_count}/{total}"),
        restarts,
        node_name: spec.node_name.unwrap_or_default(),
        pod_ip: status.pod_ip.unwrap_or_default(),
        image,
        created_at: meta
            .creation_timestamp
            .map(|t| t.0.to_rfc3339())
            .unwrap_or_default(),
        labels,
        containers,
    }
}

pub(crate) fn map_deployment(item: Deployment) -> DeploymentSummaryDto {
    let meta = item.metadata;
    let spec = item.spec.unwrap_or_default();
    let status = item.status.unwrap_or_default();
    let desired = spec.replicas.unwrap_or(status.replicas.unwrap_or(0));
    let ready = status.ready_replicas.unwrap_or(0);
    let image = spec
        .template
        .spec
        .as_ref()
        .and_then(|pod| pod.containers.first())
        .map(|c| c.image.clone().unwrap_or_default())
        .unwrap_or_default();
    let match_labels = spec
        .selector
        .match_labels
        .unwrap_or_default()
        .into_iter()
        .collect();
    // kubectl / Lancer rollout restart writes this on the pod template.
    let restarted_at = spec
        .template
        .metadata
        .as_ref()
        .and_then(|tm| tm.annotations.as_ref())
        .and_then(|a| a.get("kubectl.kubernetes.io/restartedAt").cloned())
        .unwrap_or_default();

    DeploymentSummaryDto {
        uid: meta
            .uid
            .unwrap_or_else(|| meta.name.clone().unwrap_or_default()),
        name: meta.name.unwrap_or_default(),
        namespace: meta.namespace.unwrap_or_default(),
        ready: format!("{ready}/{desired}"),
        replicas: desired,
        up_to_date: status.updated_replicas.unwrap_or(0),
        available: status.available_replicas.unwrap_or(0),
        image,
        created_at: meta
            .creation_timestamp
            .map(|t| t.0.to_rfc3339())
            .unwrap_or_default(),
        restarted_at,
        match_labels,
    }
}

pub(crate) fn map_service(item: Service) -> ServiceSummaryDto {
    let meta = item.metadata;
    let spec = item.spec.unwrap_or_default();
    let ports = spec
        .ports
        .unwrap_or_default()
        .into_iter()
        .map(|port| {
            let proto = port.protocol.unwrap_or_else(|| "TCP".into());
            format!("{}/{proto}", port.port)
        })
        .collect::<Vec<_>>()
        .join(", ");
    let selector = spec.selector.unwrap_or_default().into_iter().collect();

    ServiceSummaryDto {
        uid: meta
            .uid
            .unwrap_or_else(|| meta.name.clone().unwrap_or_default()),
        name: meta.name.unwrap_or_default(),
        namespace: meta.namespace.unwrap_or_default(),
        service_type: spec.type_.unwrap_or_else(|| "ClusterIP".into()),
        cluster_ip: spec.cluster_ip.unwrap_or_default(),
        ports,
        created_at: meta
            .creation_timestamp
            .map(|t| t.0.to_rfc3339())
            .unwrap_or_default(),
        selector,
    }
}

pub(crate) fn map_event(item: Event) -> EventSummaryDto {
    let meta = item.metadata;
    let involved = item.involved_object;
    let source = item.source.unwrap_or_default();
    let source_str = match (source.component, source.host) {
        (Some(c), Some(h)) => format!("{c}/{h}"),
        (Some(c), None) => c,
        (None, Some(h)) => h,
        (None, None) => String::new(),
    };

    let event_time = item.event_time.map(|t| t.0.to_rfc3339());
    let first_timestamp = item
        .first_timestamp
        .map(|t| t.0.to_rfc3339())
        .or_else(|| event_time.clone())
        .or_else(|| meta.creation_timestamp.map(|t| t.0.to_rfc3339()))
        .unwrap_or_default();
    let last_timestamp = item
        .last_timestamp
        .map(|t| t.0.to_rfc3339())
        .or_else(|| event_time)
        .or_else(|| {
            if first_timestamp.is_empty() {
                None
            } else {
                Some(first_timestamp.clone())
            }
        })
        .unwrap_or_default();

    EventSummaryDto {
        uid: meta
            .uid
            .unwrap_or_else(|| meta.name.clone().unwrap_or_default()),
        name: meta.name.unwrap_or_default(),
        namespace: meta.namespace.unwrap_or_default(),
        event_type: item.type_.unwrap_or_else(|| "Normal".into()),
        reason: item.reason.unwrap_or_default(),
        message: item.message.unwrap_or_default(),
        count: item.count.unwrap_or(1),
        involved_kind: involved.kind.unwrap_or_default(),
        involved_name: involved.name.unwrap_or_default(),
        source: source_str,
        first_timestamp,
        last_timestamp,
    }
}

fn read_kubeconfig(path: &Path) -> Result<Kubeconfig, AppError> {
    if !path.exists() {
        return Err(AppError::kubeconfig_invalid(
            format!("kubeconfig not found: {}", path.display()),
            None,
        ));
    }
    Kubeconfig::read_from(path).map_err(|err| {
        AppError::kubeconfig_invalid(
            "failed to parse kubeconfig",
            Some(redact_err(&err.to_string())),
        )
    })
}

/// Reachability probe that works for namespace-scoped Rancher users.
async fn probe_cluster_reachable(client: Client) -> Result<(), AppError> {
    // 1) Prefer nodes list (common for Rancher project members).
    let nodes: Api<Node> = Api::all(client.clone());
    if nodes.list(&ListParams::default().limit(1)).await.is_ok() {
        return Ok(());
    }

    // 2) Try known project namespaces (test env allowlist).
    for ns in ["sly-test", "sly-dev", "sly-uat", "bp-test", "default"] {
        let api: Api<Namespace> = Api::all(client.clone());
        if api.get(ns).await.is_ok() {
            return Ok(());
        }
    }

    // 3) Last resort: namespaced pod list in sly-test.
    let pods: Api<Pod> = Api::namespaced(client, "sly-test");
    pods.list(&ListParams::default().limit(1))
        .await
        .map_err(map_kube_error)?;
    Ok(())
}

fn build_identity(path: &Path, context: &str, readonly: bool) -> Result<ClusterIdentity, AppError> {
    let kubeconfig = read_kubeconfig(path)?;
    let ctx = kubeconfig
        .contexts
        .iter()
        .find(|c| c.name == context)
        .ok_or_else(|| {
            AppError::kubeconfig_invalid(format!("context not found: {context}"), None)
        })?;
    let cluster_name = ctx
        .context
        .as_ref()
        .map(|c| c.cluster.clone())
        .ok_or_else(|| AppError::kubeconfig_invalid("context missing cluster", None))?;
    let cluster = kubeconfig
        .clusters
        .iter()
        .find(|c| c.name == cluster_name)
        .ok_or_else(|| {
            AppError::kubeconfig_invalid(format!("cluster not found: {cluster_name}"), None)
        })?;
    let cluster_data = cluster
        .cluster
        .as_ref()
        .ok_or_else(|| AppError::kubeconfig_invalid("cluster entry empty", None))?;
    let api_server = cluster_data
        .server
        .clone()
        .ok_or_else(|| AppError::kubeconfig_invalid("api server missing", None))?;
    let tls_insecure = cluster_data.insecure_skip_tls_verify.unwrap_or(false);
    let ca_fingerprint = fingerprint_ca(cluster_data)?;
    let id = ClusterId(format!(
        "sha256:{}",
        short_hash(&format!("{api_server}|{ca_fingerprint}|{context}"))
    ));
    let risk_level = infer_risk_level(&api_server);

    if tls_insecure {
        warn!(
            target: "lancer::k8s",
            context,
            api_server = %api_server,
            "TLS verification disabled for this cluster"
        );
    }

    Ok(ClusterIdentity {
        id,
        display_name: context.to_string(),
        api_server,
        ca_fingerprint,
        context: context.to_string(),
        risk_level,
        tls_insecure,
        readonly,
        credential_mode: CredentialMode::KubeconfigPath,
        kubeconfig_path_display: display_kubeconfig_path(path),
        capabilities: ClusterCapabilities {
            can_list_pods: false,
            can_get_pods: false,
            can_delete_pods: false,
            can_patch_deployments: false,
            can_delete_deployments: false,
            can_create_pods_exec: false,
            can_get_pods_log: false,
            ssar_ok: false,
        },
    })
}

fn display_kubeconfig_path(path: &Path) -> String {
    let raw = path.display().to_string();
    if let Some(home) = dirs::home_dir() {
        let home_s = home.display().to_string();
        if let Some(rest) = raw.strip_prefix(&home_s) {
            return format!("~{rest}");
        }
    }
    raw
}

async fn build_client(path: &Path, context: &str) -> Result<Client, AppError> {
    let kubeconfig = read_kubeconfig(path)?;
    let options = KubeConfigOptions {
        context: Some(context.to_string()),
        ..KubeConfigOptions::default()
    };
    let config = Config::from_custom_kubeconfig(kubeconfig, &options)
        .await
        .map_err(|err| {
            AppError::kubeconfig_invalid(
                "failed to build kubernetes config",
                Some(redact_err(&err.to_string())),
            )
        })?;
    Client::try_from(config).map_err(|err| {
        AppError::auth_failed(
            "failed to create kubernetes client",
            Some(redact_err(&err.to_string())),
        )
    })
}

fn fingerprint_ca(cluster: &kube::config::Cluster) -> Result<String, AppError> {
    // Fingerprint CA material without logging secrets. Prefer file bytes; else hash CA data blob.
    if let Some(path) = &cluster.certificate_authority {
        let bytes = std::fs::read(path).map_err(|err| {
            AppError::kubeconfig_invalid(
                format!("cannot read certificate-authority: {path}"),
                Some(err.to_string()),
            )
        })?;
        return Ok(format!("sha256:{}", short_hash_bytes(&bytes)));
    }
    if let Some(data) = &cluster.certificate_authority_data {
        return Ok(format!("sha256:{}", short_hash(data.trim())));
    }
    if cluster.insecure_skip_tls_verify.unwrap_or(false) {
        return Ok("insecure".into());
    }
    Ok("unknown".into())
}

fn short_hash(input: &str) -> String {
    short_hash_bytes(input.as_bytes())
}

fn short_hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    hex::encode(&digest[..16])
}

fn infer_risk_level(api_server: &str) -> EnvironmentRiskLevel {
    let lower = api_server.to_ascii_lowercase();
    if lower.contains("127.0.0.1")
        || lower.contains("localhost")
        || lower.contains(".orb.local")
        || lower.contains("orbstack")
    {
        EnvironmentRiskLevel::Local
    } else {
        EnvironmentRiskLevel::Dev
    }
}

fn map_kube_error(err: kube::Error) -> AppError {
    let text = redact_err(&err.to_string());
    if let kube::Error::Api(api) = &err {
        return match api.code {
            401 => AppError::auth_failed("kubernetes authentication failed", Some(text)),
            403 => AppError::permission_denied("kubernetes permission denied", Some(text)),
            404 => AppError::not_found("kubernetes resource not found", Some(text)),
            409 => AppError::coded(
                "K8S_CONFLICT",
                "kubernetes resource version conflict; re-read and retry",
                Some(text),
                false,
            ),
            _ => AppError::api_error("kubernetes request failed", Some(text)),
        };
    }
    let lower = text.to_ascii_lowercase();
    if lower.contains("certificate") || lower.contains("tls") || lower.contains("x509") {
        return AppError::tls_failed("kubernetes tls failed", Some(text));
    }
    if lower.contains("connection refused")
        || lower.contains("timed out")
        || lower.contains("dns error")
    {
        return AppError::unreachable("kubernetes api unreachable", Some(text));
    }
    AppError::unreachable("kubernetes request failed", Some(text))
}

fn redact_err(input: &str) -> String {
    crate::shared::redact::redact_text(input)
}

pub fn default_kubeconfig_path() -> PathBuf {
    if let Ok(path) = std::env::var("KUBECONFIG") {
        let first = path.split(':').next().unwrap_or(&path);
        return PathBuf::from(first);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".kube")
        .join("config")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn risk_level_local_for_loopback() {
        assert_eq!(
            infer_risk_level("https://127.0.0.1:6443"),
            EnvironmentRiskLevel::Local
        );
    }

    #[test]
    fn empty_namespace_is_rejected() {
        let err = require_namespace("").expect_err("empty namespace");
        assert_eq!(err.to_dto().code, "NAMESPACE_REQUIRED");
        assert!(require_namespace("  ").is_err());
        assert!(require_namespace("default").is_ok());
    }
}
