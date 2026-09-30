use crate::application::AppServices;
use crate::shared::diagnostics::{self, TracingGuard};
use tauri::{Manager, RunEvent};

struct DiagnosticsState {
    _guard: TracingGuard,
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppServices::new())
        .setup(|app| {
            let log_dir = app.path().app_log_dir()?;
            let guard = diagnostics::init(&log_dir)?;
            app.manage(DiagnosticsState { _guard: guard });

            let managed_root = app.path().app_data_dir()?.join("managed-logs");
            let services = app.state::<AppServices>();
            tauri::async_runtime::block_on(async {
                services.init_managed_logs_root(managed_root.clone()).await
            })
            .map_err(|e| e.to_string())?;
            tracing::info!(
                target: "lancer::app",
                path = %log_dir.display(),
                managed_logs = %managed_root.display(),
                "application started"
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::commands::health::app_health,
            crate::commands::health::ack_abnormal_exit,
            crate::commands::health::app_prepare_shutdown,
            crate::commands::health::list_diagnostic_log_files,
            crate::commands::frontend_log::report_frontend_log,
            crate::commands::cluster::list_kube_contexts,
            crate::commands::cluster::connect_cluster,
            crate::commands::cluster::disconnect_cluster,
            crate::commands::cluster::list_connected_clusters,
            crate::commands::credentials::credentials_import_kubeconfig,
            crate::commands::credentials::credentials_get_kube_status,
            crate::commands::credentials::credentials_get_kubeconfig_yaml,
            crate::commands::credentials::credentials_set_kube_context,
            crate::commands::credentials::credentials_get_jenkins_config,
            crate::commands::credentials::credentials_save_jenkins_config,
            crate::commands::namespace::list_namespaces,
            crate::commands::pod::list_pods,
            crate::commands::deployment::list_deployments,
            crate::commands::deployment::scale_deployment,
            crate::commands::deployment::restart_deployment,
            crate::commands::deployment::update_deployment_image,
            crate::commands::deployment::delete_deployment,
            crate::commands::service::list_services,
            crate::commands::event::list_events,
            crate::commands::watch::start_resource_watch,
            crate::commands::watch::stop_resource_watch,
            crate::commands::yaml::get_resource_yaml,
            crate::commands::managed_log::open_managed_log_session,
            crate::commands::managed_log::get_managed_log_session,
            crate::commands::managed_log::read_managed_log_window,
            crate::commands::managed_log::close_managed_log_session,
            crate::commands::managed_log::pause_managed_log_session,
            crate::commands::docker::docker_ping,
            crate::commands::docker::docker_list_containers,
            crate::commands::docker::docker_container_logs,
            crate::commands::docker::docker_inspect_container,
            crate::commands::docker::docker_start_container,
            crate::commands::docker::docker_stop_container,
            crate::commands::docker::docker_restart_container,
            crate::commands::docker::docker_remove_container,
            crate::commands::docker::docker_list_images,
            crate::commands::docker::docker_remove_image,
            crate::commands::docker::docker_pull_image,
            crate::commands::docker::docker_list_volumes,
            crate::commands::docker::docker_remove_volume,
            crate::commands::docker::docker_exec_open,
            crate::commands::docker::docker_exec_write,
            crate::commands::docker::docker_exec_resize,
            crate::commands::docker::docker_exec_close,
            crate::commands::pod_exec::pod_exec_open,
            crate::commands::pod_exec::pod_exec_write,
            crate::commands::pod_exec::pod_exec_resize,
            crate::commands::pod_exec::pod_exec_close,
            crate::commands::jenkins::jenkins_connect,
            crate::commands::jenkins::jenkins_disconnect,
            crate::commands::jenkins::jenkins_status,
            crate::commands::jenkins::jenkins_list_jobs,
            crate::commands::jenkins::jenkins_list_builds,
            crate::commands::jenkins::jenkins_get_job,
            crate::commands::jenkins::jenkins_get_job_config,
            crate::commands::jenkins::jenkins_update_job_config,
            crate::commands::jenkins::jenkins_build_job,
            crate::commands::jenkins::jenkins_get_build,
            crate::commands::jenkins::jenkins_get_console,
            crate::commands::jenkins::jenkins_stop_build,
            crate::commands::jenkins::jenkins_executor_status,
            crate::commands::jenkins::jenkins_list_queue,
            crate::commands::jenkins::jenkins_cancel_queue_item,
            crate::commands::jenkins::jenkins_activity_snapshot,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Lancer");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            // Safety net if the frontend never reached prepareShutdown.
            let services = app_handle.state::<AppServices>();
            tauri::async_runtime::block_on(async {
                services.prepare_shutdown().await;
            });
            tracing::info!(target: "lancer::app", "application exited");
        }
    });
}
