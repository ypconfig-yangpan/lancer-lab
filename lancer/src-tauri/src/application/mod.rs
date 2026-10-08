use std::path::PathBuf;

use crate::domain::cluster::{ClusterId, ClusterIdentity, KubeContextSummary};
use crate::domain::error::AppError;
use crate::domain::operation::OperationId;
use crate::infrastructure::kubernetes::{
    default_kubeconfig_path, ClusterClientRegistry, DeleteDeploymentResultDto, DeploymentSummaryDto,
    EventSummaryDto, ManifestResourceKind, PodExecManager, PodExecSessionDto, PodSummaryDto,
    ResourceWatchKind, ResourceWatchManager, ResourceYamlDto, RestartDeploymentResultDto,
    ScaleDeploymentResultDto, ServiceSummaryDto, UpdateDeploymentImageResultDto,
};
use crate::infrastructure::docker::{
    DockerContainerActionResultDto, DockerContainerDetailDto, DockerContainerSummaryDto,
    DockerEngine, DockerExecManager, DockerExecSessionDto, DockerImageActionResultDto,
    DockerImageSummaryDto, DockerLogLineDto, DockerPingDto, DockerVolumeActionResultDto,
    DockerVolumeSummaryDto,
};
use crate::infrastructure::jenkins::{
    JenkinsActivityListenManager, JenkinsActivitySnapshotDto, JenkinsBuildDetailDto,
    JenkinsBuildSummaryDto, JenkinsBuildTriggerResultDto, JenkinsClient, JenkinsConnectResultDto,
    JenkinsConsoleChunkDto, JenkinsExecutorStatusDto, JenkinsJobConfigDto, JenkinsJobDetailDto,
    JenkinsJobSummaryDto, JenkinsQueueItemDto, JenkinsStatusDto, JenkinsWebhookListenManager,
};
use crate::infrastructure::managed_logs::{
    start_kube_follow, FindLineAtTimeDto, LogSessionInfoDto, LogSessionKey, LogWindowDto,
    ManagedLogStore, OpenManagedLogInput, SearchResultDto,
};
use k8s_openapi::api::core::v1::Pod;
use kube::api::Api;

/// Shared application services injected into Tauri state.
#[derive(Clone)]
pub struct AppServices {
    pub clusters: ClusterClientRegistry,
    pub watches: ResourceWatchManager,
    pub managed_logs: ManagedLogStore,
    pub docker: DockerEngine,
    pub docker_exec: DockerExecManager,
    pub pod_exec: PodExecManager,
    pub jenkins: JenkinsClient,
    pub jenkins_activity: JenkinsActivityListenManager,
    pub jenkins_webhook: JenkinsWebhookListenManager,
}

impl AppServices {
    pub fn new() -> Self {
        Self {
            clusters: ClusterClientRegistry::new(),
            watches: ResourceWatchManager::new(),
            managed_logs: ManagedLogStore::new(),
            docker: DockerEngine::new(),
            docker_exec: DockerExecManager::new(),
            pod_exec: PodExecManager::new(),
            jenkins: JenkinsClient::new(),
            jenkins_activity: JenkinsActivityListenManager::new(),
            jenkins_webhook: JenkinsWebhookListenManager::new(),
        }
    }

    pub async fn list_kube_contexts(
        &self,
        kubeconfig_path: Option<String>,
    ) -> Result<Vec<KubeContextSummary>, AppError> {
        let path = resolve_kubeconfig_path(kubeconfig_path);
        ClusterClientRegistry::list_contexts(&path).await
    }

    #[tracing::instrument(
        skip(self, kubeconfig_path),
        fields(operation_id, context = %context)
    )]
    pub async fn connect_cluster(
        &self,
        kubeconfig_path: Option<String>,
        context: String,
        readonly: bool,
        default_namespace: Option<String>,
    ) -> Result<ClusterIdentity, AppError> {
        tracing::Span::current().record(
            "operation_id",
            tracing::field::display(OperationId::generate()),
        );
        let path = resolve_kubeconfig_path(kubeconfig_path);
        if context.trim().is_empty() {
            return Err(AppError::kubeconfig_invalid("context is required", None));
        }
        self.clusters
            .connect(path, context, readonly, default_namespace)
            .await
    }

    #[tracing::instrument(skip(self), fields(operation_id, cluster_id = %cluster_id))]
    pub async fn disconnect_cluster(&self, cluster_id: String) -> Result<(), AppError> {
        tracing::Span::current().record(
            "operation_id",
            tracing::field::display(OperationId::generate()),
        );
        self.watches.stop_all_for_cluster(&cluster_id).await;
        self.clusters.disconnect(&ClusterId(cluster_id)).await
    }

    pub async fn list_connected_clusters(&self) -> Vec<ClusterIdentity> {
        self.clusters.list_connected().await
    }

    pub async fn list_namespaces(&self, cluster_id: String) -> Result<Vec<String>, AppError> {
        tracing::debug!(
            target: "lancer::k8s",
            cluster_id = %cluster_id,
            "list_namespaces"
        );
        self.clusters.list_namespaces(&ClusterId(cluster_id)).await
    }

    pub async fn list_pods(
        &self,
        cluster_id: String,
        namespace: String,
    ) -> Result<Vec<PodSummaryDto>, AppError> {
        tracing::debug!(
            target: "lancer::k8s",
            cluster_id = %cluster_id,
            namespace = %namespace,
            "list_pods"
        );
        self.clusters
            .list_pods(&ClusterId(cluster_id), &namespace)
            .await
    }

    pub async fn list_deployments(
        &self,
        cluster_id: String,
        namespace: String,
    ) -> Result<Vec<DeploymentSummaryDto>, AppError> {
        tracing::debug!(
            target: "lancer::k8s",
            cluster_id = %cluster_id,
            namespace = %namespace,
            "list_deployments"
        );
        self.clusters
            .list_deployments(&ClusterId(cluster_id), &namespace)
            .await
    }

    #[tracing::instrument(
        skip(self),
        fields(operation_id, cluster_id = %cluster_id, namespace = %namespace, name = %name, replicas)
    )]
    pub async fn scale_deployment(
        &self,
        cluster_id: String,
        namespace: String,
        name: String,
        replicas: i32,
    ) -> Result<ScaleDeploymentResultDto, AppError> {
        tracing::Span::current().record(
            "operation_id",
            tracing::field::display(OperationId::generate()),
        );
        self.clusters
            .scale_deployment(&ClusterId(cluster_id), &namespace, &name, replicas)
            .await
    }

    #[tracing::instrument(
        skip(self),
        fields(operation_id, cluster_id = %cluster_id, namespace = %namespace, name = %name)
    )]
    pub async fn restart_deployment(
        &self,
        cluster_id: String,
        namespace: String,
        name: String,
    ) -> Result<RestartDeploymentResultDto, AppError> {
        tracing::Span::current().record(
            "operation_id",
            tracing::field::display(OperationId::generate()),
        );
        self.clusters
            .restart_deployment(&ClusterId(cluster_id), &namespace, &name)
            .await
    }

    #[tracing::instrument(
        skip(self),
        fields(operation_id, cluster_id = %cluster_id, namespace = %namespace, name = %name, image = %image)
    )]
    pub async fn update_deployment_image(
        &self,
        cluster_id: String,
        namespace: String,
        name: String,
        image: String,
        container: Option<String>,
    ) -> Result<UpdateDeploymentImageResultDto, AppError> {
        tracing::Span::current().record(
            "operation_id",
            tracing::field::display(OperationId::generate()),
        );
        self.clusters
            .update_deployment_image(
                &ClusterId(cluster_id),
                &namespace,
                &name,
                &image,
                container.as_deref(),
            )
            .await
    }

    #[tracing::instrument(
        skip(self),
        fields(operation_id, cluster_id = %cluster_id, namespace = %namespace, name = %name)
    )]
    pub async fn delete_deployment(
        &self,
        cluster_id: String,
        namespace: String,
        name: String,
    ) -> Result<DeleteDeploymentResultDto, AppError> {
        tracing::Span::current().record(
            "operation_id",
            tracing::field::display(OperationId::generate()),
        );
        self.clusters
            .delete_deployment(&ClusterId(cluster_id), &namespace, &name)
            .await
    }

    pub async fn list_services(
        &self,
        cluster_id: String,
        namespace: String,
    ) -> Result<Vec<ServiceSummaryDto>, AppError> {
        tracing::debug!(
            target: "lancer::k8s",
            cluster_id = %cluster_id,
            namespace = %namespace,
            "list_services"
        );
        self.clusters
            .list_services(&ClusterId(cluster_id), &namespace)
            .await
    }

    pub async fn list_events(
        &self,
        cluster_id: String,
        namespace: String,
    ) -> Result<Vec<EventSummaryDto>, AppError> {
        tracing::debug!(
            target: "lancer::k8s",
            cluster_id = %cluster_id,
            namespace = %namespace,
            "list_events"
        );
        self.clusters
            .list_events(&ClusterId(cluster_id), &namespace)
            .await
    }

    pub async fn start_resource_watch(
        &self,
        app: tauri::AppHandle,
        cluster_id: String,
        namespace: String,
        kind: ResourceWatchKind,
    ) -> Result<(), AppError> {
        self.watches
            .start(app, &self.clusters, cluster_id, namespace, kind)
            .await
    }

    pub async fn stop_resource_watch(
        &self,
        cluster_id: String,
        namespace: String,
        kind: ResourceWatchKind,
    ) {
        self.watches.stop(cluster_id, namespace, kind).await;
    }

    pub async fn get_resource_yaml(
        &self,
        cluster_id: String,
        namespace: String,
        kind: ManifestResourceKind,
        name: String,
    ) -> Result<ResourceYamlDto, AppError> {
        tracing::debug!(
            target: "lancer::k8s",
            cluster_id = %cluster_id,
            namespace = %namespace,
            kind = ?kind,
            name = %name,
            "get_resource_yaml"
        );
        self.clusters
            .get_resource_yaml(&ClusterId(cluster_id), &namespace, kind, &name)
            .await
    }

    pub async fn init_managed_logs_root(&self, root: PathBuf) -> Result<(), AppError> {
        self.managed_logs.set_root(root).await
    }

    pub async fn open_managed_log(
        &self,
        app: tauri::AppHandle,
        input: OpenManagedLogInput,
    ) -> Result<LogSessionInfoDto, AppError> {
        let mut connection_id = input
            .connection_id
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let use_kube_stream = connection_id.is_some() && input.seed_lines.is_none();

        if !use_kube_stream {
            return self.managed_logs.open(input).await;
        }

        let cluster_id = ClusterId(connection_id.take().expect("use_kube_stream"));
        let handle = self.clusters.get(&cluster_id).await?;
        let client = handle.client.clone();

        let namespace = input
            .namespace
            .clone()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "default".to_string());
        let pod = input
            .pod
            .clone()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| {
                AppError::coded(
                    "LOG_STREAM_FAILED",
                    "pod name is required for kube log stream",
                    None,
                    false,
                )
            })?;
        let container = input.container.clone().unwrap_or_default();
        let follow = input.follow;
        let previous = input.previous;
        let since_seconds = input.since_seconds;
        let tail_lines = input.tail_lines;

        let container_id = resolve_container_id(
            client.clone(),
            &namespace,
            &pod,
            &container,
            previous,
        )
        .await;
        let mut input = input;
        input.container_id = Some(container_id.clone());

        if let Some(key) = LogSessionKey::from_open_input(&input) {
            if let Some(hit) = self.managed_logs.try_reattach(&key).await {
                if hit.needs_stream {
                    let abort = start_kube_follow(
                        app,
                        &self.managed_logs,
                        hit.info.session_id.clone(),
                        hit.path,
                        client,
                        namespace,
                        pod,
                        container,
                        follow,
                        previous,
                        None,
                        None,
                        hit.resume_since,
                        hit.line_counter,
                        hit.paused,
                    );
                    self.managed_logs
                        .attach_follow_abort(&hit.info.session_id, abort)
                        .await?;
                }
                return Ok(hit.info);
            }
        }

        let (info, path, line_counter, paused) =
            self.managed_logs.open_for_stream(input).await?;

        let abort = start_kube_follow(
            app,
            &self.managed_logs,
            info.session_id.clone(),
            path,
            client,
            namespace,
            pod,
            container,
            follow,
            previous,
            since_seconds,
            tail_lines,
            None,
            line_counter,
            paused,
        );
        self.managed_logs
            .attach_follow_abort(&info.session_id, abort)
            .await?;
        Ok(info)
    }

    pub async fn pause_managed_log_session(
        &self,
        session_id: String,
        paused: bool,
    ) -> Result<LogSessionInfoDto, AppError> {
        self.managed_logs.set_paused(&session_id, paused).await
    }

    pub async fn get_managed_log_session(
        &self,
        session_id: String,
    ) -> Result<LogSessionInfoDto, AppError> {
        self.managed_logs.get_session(&session_id).await
    }

    pub async fn read_managed_log_window(
        &self,
        session_id: String,
        offset: u64,
        limit: u64,
    ) -> Result<LogWindowDto, AppError> {
        self.managed_logs
            .read_window(&session_id, offset, limit)
            .await
    }

    pub async fn close_managed_log_session(&self, session_id: String) -> Result<(), AppError> {
        self.managed_logs.close(&session_id).await
    }

    pub async fn search_managed_log(
        &self,
        session_id: String,
        pattern: String,
        regex: bool,
        case_sensitive: bool,
        max_matches: u64,
        cursor_byte: u64,
    ) -> Result<SearchResultDto, AppError> {
        self.managed_logs
            .search(
                &session_id,
                pattern,
                regex,
                case_sensitive,
                max_matches,
                cursor_byte,
            )
            .await
    }

    pub async fn cancel_managed_log_search(&self, session_id: String) -> Result<(), AppError> {
        self.managed_logs.cancel_search(&session_id).await
    }

    pub async fn find_managed_log_line_at_time(
        &self,
        session_id: String,
        target: String,
    ) -> Result<FindLineAtTimeDto, AppError> {
        self.managed_logs
            .find_line_at_time(&session_id, target)
            .await
    }

    pub async fn docker_ping(&self) -> Result<DockerPingDto, AppError> {
        self.docker.ping().await
    }

    pub async fn docker_list_containers(
        &self,
        all: bool,
    ) -> Result<Vec<DockerContainerSummaryDto>, AppError> {
        self.docker.list_containers(all).await
    }

    pub async fn docker_container_logs(
        &self,
        container_id: String,
        tail: Option<u64>,
    ) -> Result<Vec<DockerLogLineDto>, AppError> {
        self.docker.container_logs(&container_id, tail).await
    }

    pub async fn docker_inspect_container(
        &self,
        container_id: String,
    ) -> Result<DockerContainerDetailDto, AppError> {
        self.docker.inspect_container(&container_id).await
    }

    pub async fn docker_start_container(
        &self,
        container_id: String,
    ) -> Result<DockerContainerActionResultDto, AppError> {
        self.docker.start_container(&container_id).await
    }

    pub async fn docker_stop_container(
        &self,
        container_id: String,
    ) -> Result<DockerContainerActionResultDto, AppError> {
        self.docker.stop_container(&container_id).await
    }

    pub async fn docker_restart_container(
        &self,
        container_id: String,
    ) -> Result<DockerContainerActionResultDto, AppError> {
        self.docker.restart_container(&container_id).await
    }

    pub async fn docker_remove_container(
        &self,
        container_id: String,
        force: bool,
    ) -> Result<DockerContainerActionResultDto, AppError> {
        self.docker.remove_container(&container_id, force).await
    }

    pub async fn docker_list_images(&self) -> Result<Vec<DockerImageSummaryDto>, AppError> {
        self.docker.list_images().await
    }

    pub async fn docker_remove_image(
        &self,
        image: String,
        force: bool,
    ) -> Result<DockerImageActionResultDto, AppError> {
        self.docker.remove_image(&image, force).await
    }

    pub async fn docker_pull_image(
        &self,
        reference: String,
    ) -> Result<DockerImageActionResultDto, AppError> {
        self.docker.pull_image(&reference).await
    }

    pub async fn docker_list_volumes(&self) -> Result<Vec<DockerVolumeSummaryDto>, AppError> {
        self.docker.list_volumes().await
    }

    pub async fn docker_remove_volume(
        &self,
        name: String,
        force: bool,
    ) -> Result<DockerVolumeActionResultDto, AppError> {
        self.docker.remove_volume(&name, force).await
    }

    pub async fn docker_exec_open(
        &self,
        app: tauri::AppHandle,
        container_id: String,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<DockerExecSessionDto, AppError> {
        self.docker_exec.open(app, container_id, cols, rows).await
    }

    pub async fn docker_exec_write(&self, session_id: String, data: String) -> Result<(), AppError> {
        self.docker_exec.write(&session_id, &data).await
    }

    pub async fn docker_exec_resize(
        &self,
        session_id: String,
        cols: u16,
        rows: u16,
    ) -> Result<(), AppError> {
        self.docker_exec.resize(&session_id, cols, rows).await
    }

    pub async fn docker_exec_close(
        &self,
        app: tauri::AppHandle,
        session_id: String,
    ) -> Result<(), AppError> {
        self.docker_exec.close(Some(&app), &session_id).await
    }

    pub async fn pod_exec_open(
        &self,
        app: tauri::AppHandle,
        cluster_id: String,
        namespace: String,
        pod: String,
        container: Option<String>,
        cols: Option<u16>,
        rows: Option<u16>,
    ) -> Result<PodExecSessionDto, AppError> {
        self.pod_exec
            .open(
                app,
                &self.clusters,
                cluster_id,
                namespace,
                pod,
                container,
                cols,
                rows,
            )
            .await
    }

    pub async fn pod_exec_write(&self, session_id: String, data: String) -> Result<(), AppError> {
        self.pod_exec.write(&session_id, &data).await
    }

    pub async fn pod_exec_resize(
        &self,
        session_id: String,
        cols: u16,
        rows: u16,
    ) -> Result<(), AppError> {
        self.pod_exec.resize(&session_id, cols, rows).await
    }

    pub async fn pod_exec_close(
        &self,
        app: tauri::AppHandle,
        session_id: String,
    ) -> Result<(), AppError> {
        self.pod_exec.close(Some(&app), &session_id).await
    }

    /// Frontend-initiated clean shutdown: stop watches, drop cluster clients.
    pub async fn prepare_shutdown(&self) {
        tracing::info!(target: "lancer::app", "prepare_shutdown");
        self.watches.stop_all().await;
        self.clusters.disconnect_all().await;
        self.managed_logs.clear_all().await;
        self.docker_exec.clear_all().await;
        self.pod_exec.clear_all().await;
        self.jenkins_activity.stop().await;
        self.jenkins_webhook.stop().await;
        self.jenkins.disconnect().await;
    }

    pub async fn jenkins_connect(
        &self,
        app: tauri::AppHandle,
        config_path: Option<String>,
    ) -> Result<JenkinsConnectResultDto, AppError> {
        let result = self.jenkins.connect(config_path).await?;
        self.jenkins_activity
            .start(app.clone(), self.jenkins.clone())
            .await;
        if let Some(webhook_cfg) = self.jenkins.webhook_listen_config().await {
            self.jenkins_webhook.start(app, webhook_cfg).await;
        }
        Ok(result)
    }

    pub async fn jenkins_disconnect(&self) {
        self.jenkins_activity.stop().await;
        self.jenkins_webhook.stop().await;
        self.jenkins.disconnect().await;
    }

    pub async fn jenkins_activity_snapshot(&self) -> Result<JenkinsActivitySnapshotDto, AppError> {
        self.jenkins.activity_snapshot().await
    }

    pub async fn jenkins_status(&self) -> JenkinsStatusDto {
        self.jenkins.status().await
    }

    pub async fn jenkins_list_jobs(&self) -> Result<Vec<JenkinsJobSummaryDto>, AppError> {
        self.jenkins.list_jobs().await
    }

    pub async fn jenkins_list_builds(
        &self,
        job_full_name: String,
        limit: usize,
    ) -> Result<Vec<JenkinsBuildSummaryDto>, AppError> {
        self.jenkins.list_builds(&job_full_name, limit).await
    }

    pub async fn jenkins_get_job(
        &self,
        job_full_name: String,
    ) -> Result<JenkinsJobDetailDto, AppError> {
        self.jenkins.get_job(&job_full_name).await
    }

    pub async fn jenkins_get_job_config(
        &self,
        job_full_name: String,
    ) -> Result<JenkinsJobConfigDto, AppError> {
        self.jenkins.get_job_config(&job_full_name).await
    }

    pub async fn jenkins_update_job_config(
        &self,
        job_full_name: String,
        xml: String,
    ) -> Result<JenkinsJobConfigDto, AppError> {
        self.jenkins
            .update_job_config(&job_full_name, &xml)
            .await
    }

    pub async fn jenkins_build_job(
        &self,
        job_full_name: String,
        parameters: std::collections::HashMap<String, String>,
    ) -> Result<JenkinsBuildTriggerResultDto, AppError> {
        self.jenkins.build_job(&job_full_name, parameters).await
    }

    pub async fn jenkins_get_build(
        &self,
        job_full_name: String,
        number: i64,
    ) -> Result<JenkinsBuildDetailDto, AppError> {
        self.jenkins.get_build(&job_full_name, number).await
    }

    pub async fn jenkins_get_console(
        &self,
        job_full_name: String,
        number: i64,
        start: i64,
    ) -> Result<JenkinsConsoleChunkDto, AppError> {
        self.jenkins
            .get_console(&job_full_name, number, start)
            .await
    }

    pub async fn jenkins_stop_build(
        &self,
        job_full_name: String,
        number: i64,
    ) -> Result<(), AppError> {
        self.jenkins.stop_build(&job_full_name, number).await
    }

    pub async fn jenkins_executor_status(&self) -> Result<JenkinsExecutorStatusDto, AppError> {
        self.jenkins.executor_status().await
    }

    pub async fn jenkins_list_queue(&self) -> Result<Vec<JenkinsQueueItemDto>, AppError> {
        self.jenkins.list_queue().await
    }

    pub async fn jenkins_cancel_queue_item(&self, id: i64) -> Result<(), AppError> {
        self.jenkins.cancel_queue_item(id).await
    }

    pub async fn credentials_import_kubeconfig(
        &self,
        yaml: String,
        preferred_context: Option<String>,
        default_namespace: Option<String>,
    ) -> Result<
        crate::infrastructure::credentials::ImportKubeconfigResultDto,
        AppError,
    > {
        crate::infrastructure::credentials::import_kubeconfig_yaml(
            yaml,
            preferred_context,
            default_namespace,
        )
        .await
    }

    pub async fn credentials_get_kube_status(
        &self,
    ) -> Result<crate::infrastructure::credentials::KubeCredentialStatusDto, AppError> {
        crate::infrastructure::credentials::get_kube_credential_status().await
    }

    pub async fn credentials_get_kubeconfig_yaml(
        &self,
    ) -> Result<crate::infrastructure::credentials::KubeconfigYamlDto, AppError> {
        crate::infrastructure::credentials::get_saved_kubeconfig_yaml().await
    }

    pub async fn credentials_set_kube_context(
        &self,
        context: String,
        default_namespace: Option<String>,
    ) -> Result<crate::infrastructure::credentials::KubeCredentialStatusDto, AppError> {
        crate::infrastructure::credentials::set_kube_preferred_context(
            context,
            default_namespace,
        )
        .await
    }

    pub async fn credentials_get_jenkins_config(
        &self,
    ) -> Result<crate::infrastructure::credentials::JenkinsLocalConfigDto, AppError> {
        crate::infrastructure::credentials::get_jenkins_local_config().await
    }

    pub async fn credentials_save_jenkins_config(
        &self,
        base_url: String,
        username: String,
        api_token: String,
        webhook_enabled: bool,
        webhook_port: u16,
        webhook_token: Option<String>,
    ) -> Result<crate::infrastructure::credentials::JenkinsLocalConfigDto, AppError> {
        crate::infrastructure::credentials::save_jenkins_local_config(
            base_url,
            username,
            api_token,
            webhook_enabled,
            webhook_port,
            webhook_token,
        )
        .await
    }
}

impl Default for AppServices {
    fn default() -> Self {
        Self::new()
    }
}

/// Resolve runtime container id for Session fingerprint (CrashLoop invalidates cache).
async fn resolve_container_id(
    client: kube::Client,
    namespace: &str,
    pod: &str,
    container: &str,
    previous: bool,
) -> String {
    let api: Api<Pod> = Api::namespaced(client, namespace);
    let Ok(obj) = api.get(pod).await else {
        return String::new();
    };
    let Some(status) = obj.status else {
        return String::new();
    };
    let statuses = status.container_statuses.unwrap_or_default();
    let target = statuses.into_iter().find(|c| {
        if container.is_empty() {
            true
        } else {
            c.name == container
        }
    });
    let Some(cs) = target else {
        return String::new();
    };
    if previous {
        cs.last_state
            .and_then(|st| st.terminated)
            .and_then(|t| t.container_id)
            .unwrap_or_default()
    } else {
        cs.container_id.unwrap_or_default()
    }
}

fn resolve_kubeconfig_path(kubeconfig_path: Option<String>) -> PathBuf {
    match kubeconfig_path {
        Some(path) if !path.trim().is_empty() => expand_user_path(path.trim()),
        _ => default_kubeconfig_path(),
    }
}

fn expand_user_path(path: &str) -> PathBuf {
    if path == "~" {
        return default_kubeconfig_path()
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
    }
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs_next_home() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

fn dirs_next_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}
