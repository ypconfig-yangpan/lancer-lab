//! Local Docker Engine client (bollard). OrbStack / Docker Desktop unix socket.

mod exec;

pub use exec::{DockerExecManager, DockerExecSessionDto};

use std::collections::HashMap;

use bollard::container::{
    ListContainersOptions, LogsOptions, RemoveContainerOptions, RestartContainerOptions,
    StartContainerOptions, StatsOptions, StopContainerOptions,
};
use bollard::image::{CreateImageOptions, ListImagesOptions, RemoveImageOptions};
use bollard::volume::RemoveVolumeOptions;
use bollard::Docker;
use futures_util::StreamExt;
use serde::Serialize;
use tracing::debug;

use crate::domain::error::AppError;

const MAX_STATS_CONTAINERS: usize = 24;
const DEFAULT_LOG_TAIL: u64 = 200;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerPingDto {
    pub ok: bool,
    pub api_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerSummaryDto {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub labels: HashMap<String, String>,
    /// One-shot CPU% for running containers; "—" when unavailable.
    pub cpu: String,
    /// One-shot memory usage string; "—" when unavailable.
    pub memory: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerLogLineDto {
    pub id: String,
    pub line_number: u64,
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerActionResultDto {
    pub container_id: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageSummaryDto {
    pub id: String,
    /// Primary display tag (first RepoTag) or `<none>`.
    pub tag: String,
    /// All RepoTags joined by comma.
    pub tags: String,
    pub size: String,
    pub created: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerImageActionResultDto {
    pub image: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerVolumeSummaryDto {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub created: String,
    pub size: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerVolumeActionResultDto {
    pub volume: String,
    pub action: String,
}

/// Detail DTO for Inspector Overview (aligned to docs/ui/references/04-docker.png).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerContainerDetailDto {
    pub id: String,
    pub name: String,
    pub image: String,
    pub image_id: String,
    pub status: String,
    pub health: String,
    pub created: String,
    pub command: String,
    pub restart_policy: String,
    pub network: String,
    pub ip_address: String,
    pub ports: String,
    pub mounts: String,
    pub labels: HashMap<String, String>,
    pub cpu: String,
    pub memory: String,
}

#[derive(Clone, Default)]
pub struct DockerEngine {}

impl DockerEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub(crate) fn connect() -> Result<Docker, AppError> {
        Docker::connect_with_local_defaults().map_err(|e| {
            AppError::coded(
                "DOCKER_UNAVAILABLE",
                format!("cannot connect to Docker Engine: {e}"),
                Some(e.to_string()),
                true,
            )
        })
    }

    pub async fn ping(&self) -> Result<DockerPingDto, AppError> {
        let docker = Self::connect()?;
        let version = docker.version().await.map_err(map_bollard_error)?;
        debug!(
            target: "lancer::docker",
            api = ?version.api_version,
            "docker ping ok"
        );
        Ok(DockerPingDto {
            ok: true,
            api_version: version.api_version,
        })
    }

    pub async fn list_containers(&self, all: bool) -> Result<Vec<DockerContainerSummaryDto>, AppError> {
        let docker = Self::connect()?;
        let options = Some(ListContainersOptions::<String> {
            all,
            ..Default::default()
        });
        let list = docker
            .list_containers(options)
            .await
            .map_err(map_bollard_error)?;

        let mut out = Vec::with_capacity(list.len());
        for item in list {
            let id = item.id.unwrap_or_default();
            let short_id = if id.len() > 12 { &id[..12] } else { &id };
            let name = item
                .names
                .as_ref()
                .and_then(|names| names.first())
                .map(|n| n.trim_start_matches('/').to_string())
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| short_id.to_string());
            let image = item.image.unwrap_or_default();
            let status = item.status.unwrap_or_default();
            let state = item.state.unwrap_or_default();
            let ports = format_ports(item.ports.as_deref());
            let labels = item.labels.unwrap_or_default();
            out.push(DockerContainerSummaryDto {
                id: if id.is_empty() {
                    short_id.to_string()
                } else {
                    id
                },
                name,
                image,
                status,
                state,
                ports,
                labels,
                cpu: "—".to_string(),
                memory: "—".to_string(),
            });
        }

        enrich_running_stats(&docker, &mut out).await;
        Ok(out)
    }

    pub async fn container_logs(
        &self,
        container_id: &str,
        tail: Option<u64>,
    ) -> Result<Vec<DockerLogLineDto>, AppError> {
        if container_id.trim().is_empty() {
            return Err(AppError::coded(
                "DOCKER_ENGINE_FAILED",
                "container id is required",
                None,
                false,
            ));
        }
        let docker = Self::connect()?;
        let tail_n = tail.unwrap_or(DEFAULT_LOG_TAIL).clamp(1, 2_000);
        let options = Some(LogsOptions::<String> {
            stdout: true,
            stderr: true,
            timestamps: true,
            tail: tail_n.to_string(),
            ..Default::default()
        });

        let mut stream = docker.logs(container_id, options);
        let mut lines = Vec::new();
        let mut n = 0u64;
        while let Some(item) = stream.next().await {
            let chunk = item.map_err(map_bollard_error)?;
            let raw = String::from_utf8_lossy(chunk.as_ref()).into_owned();
            for part in raw.split('\n') {
                let trimmed = part.trim_end_matches('\r');
                if trimmed.is_empty() {
                    continue;
                }
                n += 1;
                let (timestamp, message) = split_docker_timestamp(trimmed);
                lines.push(DockerLogLineDto {
                    id: format!("docker-{n}"),
                    line_number: n,
                    timestamp: timestamp.to_string(),
                    level: infer_level(message).to_string(),
                    message: message.to_string(),
                });
            }
        }
        Ok(lines)
    }

    pub async fn inspect_container(
        &self,
        container_id: &str,
    ) -> Result<DockerContainerDetailDto, AppError> {
        let id = require_container_id(container_id)?;
        let docker = Self::connect()?;
        let info = docker
            .inspect_container(id, None)
            .await
            .map_err(map_bollard_error)?;

        let short_id = info.id.as_deref().unwrap_or(id);
        let short_id = if short_id.len() > 12 {
            &short_id[..12]
        } else {
            short_id
        };
        let name = info
            .name
            .as_deref()
            .map(|n| n.trim_start_matches('/').to_string())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| short_id.to_string());

        let state = info.state.as_ref();
        let status_raw = state
            .and_then(|s| s.status.as_ref())
            .map(|s| format!("{s:?}"))
            .unwrap_or_else(|| "unknown".to_string());
        let status_lower = status_raw.to_ascii_lowercase();
        let status_label = if status_lower.contains("running") {
            "Running".to_string()
        } else if status_lower.contains("exited") {
            "Exited".to_string()
        } else if status_lower.contains("created") {
            "Created".to_string()
        } else if status_lower.contains("paused") {
            "Paused".to_string()
        } else if status_lower.contains("restarting") {
            "Restarting".to_string()
        } else {
            status_raw
        };

        let health_raw = state
            .and_then(|s| s.health.as_ref())
            .and_then(|h| h.status.as_ref())
            .map(|s| format!("{s:?}"))
            .unwrap_or_default();
        let health_lower = health_raw.to_ascii_lowercase();
        let health = if health_lower.contains("healthy") && !health_lower.contains("unhealthy") {
            "Healthy".to_string()
        } else if health_lower.contains("unhealthy") {
            "Unhealthy".to_string()
        } else if health_lower.contains("starting") {
            "Starting".to_string()
        } else {
            "—".to_string()
        };

        let config = info.config.as_ref();
        let image = config
            .and_then(|c| c.image.clone())
            .or_else(|| info.image.clone())
            .unwrap_or_default();
        let image_id = info.image.clone().unwrap_or_default();
        let image_id_short = if image_id.len() > 19 {
            format!("{}…", &image_id[..19])
        } else {
            image_id.clone()
        };

        let command = config
            .and_then(|c| c.cmd.as_ref())
            .map(|cmd| cmd.join(" "))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "—".to_string());

        let restart_raw = info
            .host_config
            .as_ref()
            .and_then(|h| h.restart_policy.as_ref())
            .and_then(|p| p.name.as_ref())
            .map(|n| format!("{n:?}"))
            .unwrap_or_default();
        let restart_lower = restart_raw.to_ascii_lowercase();
        let restart_policy = if restart_lower.contains("unless") {
            "Unless-stopped".to_string()
        } else if restart_lower.contains("always") {
            "Always".to_string()
        } else if restart_lower.contains("on_failure") || restart_lower.contains("on-failure") {
            "On-failure".to_string()
        } else if restart_lower.contains("no") || restart_raw.is_empty() {
            "No".to_string()
        } else {
            restart_raw
        };

        let networks = info
            .network_settings
            .as_ref()
            .and_then(|n| n.networks.as_ref());
        let (network, ip_address) = if let Some(nets) = networks {
            let first = nets.iter().next();
            match first {
                Some((name, cfg)) => (
                    name.clone(),
                    cfg.ip_address
                        .clone()
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "—".to_string()),
                ),
                None => ("—".to_string(), "—".to_string()),
            }
        } else {
            (
                "—".to_string(),
                info.network_settings
                    .as_ref()
                    .and_then(|n| n.ip_address.clone())
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "—".to_string()),
            )
        };

        let ports = format_ports_from_inspect(
            info.network_settings
                .as_ref()
                .and_then(|n| n.ports.as_ref()),
        );

        let mounts = info
            .mounts
            .as_ref()
            .map(|ms| {
                ms.iter()
                    .map(|m| {
                        let src = m.source.as_deref().unwrap_or("?");
                        let dst = m.destination.as_deref().unwrap_or("?");
                        format!("{src} → {dst}")
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "—".to_string());

        let labels = config
            .and_then(|c| c.labels.clone())
            .unwrap_or_default();

        let created = info.created.clone().unwrap_or_default();

        let (cpu, memory) = if status_label.eq_ignore_ascii_case("running") {
            one_shot_stats(&docker, id)
                .await
                .unwrap_or_else(|_| ("—".to_string(), "—".to_string()))
        } else {
            ("—".to_string(), "—".to_string())
        };

        Ok(DockerContainerDetailDto {
            id: info.id.unwrap_or_else(|| id.to_string()),
            name,
            image,
            image_id: image_id_short,
            status: status_label,
            health,
            created,
            command,
            restart_policy,
            network,
            ip_address,
            ports,
            mounts,
            labels,
            cpu,
            memory,
        })
    }

    pub async fn start_container(
        &self,
        container_id: &str,
    ) -> Result<DockerContainerActionResultDto, AppError> {
        let id = require_container_id(container_id)?;
        let docker = Self::connect()?;
        docker
            .start_container(id, None::<StartContainerOptions<String>>)
            .await
            .map_err(map_bollard_error)?;
        Ok(DockerContainerActionResultDto {
            container_id: id.to_string(),
            action: "start".to_string(),
        })
    }

    pub async fn stop_container(
        &self,
        container_id: &str,
    ) -> Result<DockerContainerActionResultDto, AppError> {
        let id = require_container_id(container_id)?;
        let docker = Self::connect()?;
        docker
            .stop_container(id, Some(StopContainerOptions { t: 10 }))
            .await
            .map_err(map_bollard_error)?;
        Ok(DockerContainerActionResultDto {
            container_id: id.to_string(),
            action: "stop".to_string(),
        })
    }

    pub async fn restart_container(
        &self,
        container_id: &str,
    ) -> Result<DockerContainerActionResultDto, AppError> {
        let id = require_container_id(container_id)?;
        let docker = Self::connect()?;
        docker
            .restart_container(id, Some(RestartContainerOptions { t: 10 }))
            .await
            .map_err(map_bollard_error)?;
        Ok(DockerContainerActionResultDto {
            container_id: id.to_string(),
            action: "restart".to_string(),
        })
    }

    pub async fn remove_container(
        &self,
        container_id: &str,
        force: bool,
    ) -> Result<DockerContainerActionResultDto, AppError> {
        let id = require_container_id(container_id)?;
        let docker = Self::connect()?;
        docker
            .remove_container(
                id,
                Some(RemoveContainerOptions {
                    force,
                    v: false,
                    link: false,
                }),
            )
            .await
            .map_err(map_bollard_error)?;
        Ok(DockerContainerActionResultDto {
            container_id: id.to_string(),
            action: "remove".to_string(),
        })
    }

    pub async fn list_images(&self) -> Result<Vec<DockerImageSummaryDto>, AppError> {
        let docker = Self::connect()?;
        let options = Some(ListImagesOptions::<String> {
            all: true,
            ..Default::default()
        });
        let list = docker
            .list_images(options)
            .await
            .map_err(map_bollard_error)?;

        let mut out = Vec::with_capacity(list.len());
        for item in list {
            let id = item.id;
            let short_id = short_image_id(&id);
            let repo_tags = item.repo_tags;
            let tags_joined = if repo_tags.is_empty() {
                "<none>".to_string()
            } else {
                repo_tags.join(", ")
            };
            let tag = repo_tags
                .first()
                .cloned()
                .filter(|t| !t.is_empty() && t != "<none>:<none>")
                .unwrap_or_else(|| {
                    if short_id.is_empty() {
                        "<none>".to_string()
                    } else {
                        short_id.clone()
                    }
                });
            out.push(DockerImageSummaryDto {
                id: if id.is_empty() { short_id } else { id },
                tag,
                tags: tags_joined,
                size: format_bytes(item.size.max(0) as u64),
                created: item.created,
            });
        }
        out.sort_by(|a, b| a.tag.to_lowercase().cmp(&b.tag.to_lowercase()));
        Ok(out)
    }

    pub async fn remove_image(
        &self,
        image: &str,
        force: bool,
    ) -> Result<DockerImageActionResultDto, AppError> {
        let reference = require_image_ref(image)?;
        let docker = Self::connect()?;
        docker
            .remove_image(
                reference,
                Some(RemoveImageOptions {
                    force,
                    noprune: false,
                }),
                None,
            )
            .await
            .map_err(map_bollard_error)?;
        Ok(DockerImageActionResultDto {
            image: reference.to_string(),
            action: "remove".to_string(),
        })
    }

    pub async fn pull_image(&self, reference: &str) -> Result<DockerImageActionResultDto, AppError> {
        let raw = require_image_ref(reference)?;
        let (from_image, tag) = split_image_reference(raw);
        let docker = Self::connect()?;
        let options = Some(CreateImageOptions {
            from_image: from_image.as_str(),
            tag: tag.as_str(),
            ..Default::default()
        });
        let mut stream = docker.create_image(options, None, None);
        while let Some(item) = stream.next().await {
            let info = item.map_err(map_bollard_error)?;
            if let Some(err) = info.error.filter(|e| !e.is_empty()) {
                return Err(AppError::coded(
                    "DOCKER_ENGINE_FAILED",
                    format!("pull failed: {err}"),
                    Some(err),
                    true,
                ));
            }
        }
        Ok(DockerImageActionResultDto {
            image: raw.to_string(),
            action: "pull".to_string(),
        })
    }

    pub async fn list_volumes(&self) -> Result<Vec<DockerVolumeSummaryDto>, AppError> {
        let docker = Self::connect()?;
        let response = docker
            .list_volumes::<String>(None)
            .await
            .map_err(map_bollard_error)?;
        let list = response.volumes.unwrap_or_default();
        let mut out = Vec::with_capacity(list.len());
        for item in list {
            let size = item
                .usage_data
                .as_ref()
                .and_then(|u| {
                    if u.size < 0 {
                        None
                    } else {
                        Some(format_bytes(u.size as u64))
                    }
                })
                .unwrap_or_else(|| "—".to_string());
            let created = item
                .created_at
                .map(|t| t.to_string())
                .unwrap_or_else(|| "—".to_string());
            out.push(DockerVolumeSummaryDto {
                name: item.name,
                driver: item.driver,
                mountpoint: item.mountpoint,
                created,
                size,
            });
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(out)
    }

    pub async fn remove_volume(
        &self,
        name: &str,
        force: bool,
    ) -> Result<DockerVolumeActionResultDto, AppError> {
        let volume = require_volume_name(name)?;
        let docker = Self::connect()?;
        docker
            .remove_volume(
                volume,
                Some(RemoveVolumeOptions { force }),
            )
            .await
            .map_err(map_bollard_error)?;
        Ok(DockerVolumeActionResultDto {
            volume: volume.to_string(),
            action: "remove".to_string(),
        })
    }
}

fn require_volume_name(name: &str) -> Result<&str, AppError> {
    let id = name.trim();
    if id.is_empty() {
        return Err(AppError::coded(
            "DOCKER_ENGINE_FAILED",
            "volume name is required",
            None,
            false,
        ));
    }
    Ok(id)
}

fn require_image_ref(image: &str) -> Result<&str, AppError> {
    let id = image.trim();
    if id.is_empty() {
        return Err(AppError::coded(
            "DOCKER_ENGINE_FAILED",
            "image reference is required",
            None,
            false,
        ));
    }
    Ok(id)
}

fn short_image_id(id: &str) -> String {
    let bare = id.strip_prefix("sha256:").unwrap_or(id);
    if bare.len() > 12 {
        bare[..12].to_string()
    } else {
        bare.to_string()
    }
}

fn split_image_reference(reference: &str) -> (String, String) {
    // Prefer tag after the last path segment: registry/repo:tag or name:tag.
    if let Some(slash) = reference.rfind('/') {
        let (prefix, name) = reference.split_at(slash + 1);
        if let Some((repo, tag)) = name.rsplit_once(':') {
            if !tag.is_empty() && !tag.contains('/') {
                return (format!("{prefix}{repo}"), tag.to_string());
            }
        }
        return (reference.to_string(), "latest".to_string());
    }
    if let Some((name, tag)) = reference.rsplit_once(':') {
        // Avoid treating bare host:port as name:tag.
        if !tag.is_empty() && !tag.chars().all(|c| c.is_ascii_digit()) {
            return (name.to_string(), tag.to_string());
        }
    }
    (reference.to_string(), "latest".to_string())
}

fn require_container_id(container_id: &str) -> Result<&str, AppError> {
    let id = container_id.trim();
    if id.is_empty() {
        return Err(AppError::coded(
            "DOCKER_ENGINE_FAILED",
            "container id is required",
            None,
            false,
        ));
    }
    Ok(id)
}

async fn enrich_running_stats(docker: &Docker, containers: &mut [DockerContainerSummaryDto]) {
    let mut budget = MAX_STATS_CONTAINERS;
    for c in containers.iter_mut() {
        if budget == 0 {
            break;
        }
        if !c.state.eq_ignore_ascii_case("running") {
            continue;
        }
        budget -= 1;
        match one_shot_stats(docker, &c.id).await {
            Ok((cpu, mem)) => {
                c.cpu = cpu;
                c.memory = mem;
            }
            Err(err) => {
                debug!(
                    target: "lancer::docker",
                    id = %c.id,
                    error = %err,
                    "stats skipped"
                );
            }
        }
    }
}

async fn one_shot_stats(docker: &Docker, id: &str) -> Result<(String, String), AppError> {
    let options = Some(StatsOptions {
        stream: false,
        one_shot: true,
    });
    let mut stream = docker.stats(id, options);
    let stats = match stream.next().await {
        Some(Ok(s)) => s,
        Some(Err(e)) => return Err(map_bollard_error(e)),
        None => {
            return Err(AppError::coded(
                "DOCKER_ENGINE_FAILED",
                "empty stats response",
                None,
                true,
            ))
        }
    };

    let cpu = format_cpu_percent(&stats);
    let memory = format_memory(&stats);
    Ok((cpu, memory))
}

fn format_cpu_percent(stats: &bollard::container::Stats) -> String {
    let cpu_delta = stats
        .cpu_stats
        .cpu_usage
        .total_usage
        .saturating_sub(stats.precpu_stats.cpu_usage.total_usage)
        as f64;
    let system_delta = stats
        .cpu_stats
        .system_cpu_usage
        .unwrap_or(0)
        .saturating_sub(stats.precpu_stats.system_cpu_usage.unwrap_or(0))
        as f64;
    if system_delta <= 0.0 || cpu_delta < 0.0 {
        return "—".to_string();
    }
    let online = stats
        .cpu_stats
        .online_cpus
        .unwrap_or_else(|| {
            stats
                .cpu_stats
                .cpu_usage
                .percpu_usage
                .as_ref()
                .map(|v| v.len() as u64)
                .unwrap_or(1)
        })
        .max(1) as f64;
    let pct = (cpu_delta / system_delta) * online * 100.0;
    format!("{pct:.1}%")
}

fn format_memory(stats: &bollard::container::Stats) -> String {
    let usage = stats.memory_stats.usage.unwrap_or(0);
    let limit = stats.memory_stats.limit.unwrap_or(0);
    if usage == 0 {
        return "—".to_string();
    }
    let used = format_bytes(usage);
    if limit > 0 {
        let pct = (usage as f64 / limit as f64) * 100.0;
        format!("{used} ({pct:.0}%)")
    } else {
        used
    }
}

fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.1}GB", b / GB)
    } else if b >= MB {
        format!("{:.0}MB", b / MB)
    } else if b >= KB {
        format!("{:.0}KB", b / KB)
    } else {
        format!("{bytes}B")
    }
}

fn format_ports(ports: Option<&[bollard::models::Port]>) -> String {
    let Some(ports) = ports else {
        return "—".to_string();
    };
    let mut parts = Vec::new();
    for p in ports {
        let private = p.private_port;
        let proto = p.typ.as_ref().map(|t| t.as_ref()).unwrap_or("tcp");
        match (p.ip.as_deref(), p.public_port) {
            (Some(ip), Some(pub_port)) if !ip.is_empty() => {
                parts.push(format!("{ip}:{pub_port}->{private}/{proto}"));
            }
            (_, Some(pub_port)) => {
                parts.push(format!("{pub_port}->{private}/{proto}"));
            }
            _ => {
                parts.push(format!("{private}/{proto}"));
            }
        }
    }
    if parts.is_empty() {
        "—".to_string()
    } else {
        parts.join(", ")
    }
}

fn format_ports_from_inspect(
    ports: Option<&std::collections::HashMap<String, Option<Vec<bollard::models::PortBinding>>>>,
) -> String {
    let Some(ports) = ports else {
        return "—".to_string();
    };
    let mut parts = Vec::new();
    for (key, bindings) in ports {
        // key like "80/tcp"
        if let Some(bindings) = bindings {
            for b in bindings {
                let host_ip = b.host_ip.as_deref().unwrap_or("");
                let host_port = b.host_port.as_deref().unwrap_or("");
                if host_port.is_empty() {
                    parts.push(key.clone());
                } else if host_ip.is_empty() || host_ip == "0.0.0.0" {
                    parts.push(format!("{host_port}:{key}"));
                } else {
                    parts.push(format!("{host_ip}:{host_port}:{key}"));
                }
            }
        } else {
            parts.push(key.clone());
        }
    }
    if parts.is_empty() {
        "—".to_string()
    } else {
        parts.join(", ")
    }
}

fn split_docker_timestamp(raw: &str) -> (&str, &str) {
    let Some((ts, rest)) = raw.split_once(' ') else {
        return ("", raw);
    };
    if ts.len() >= 20 && ts.contains('T') {
        (ts, rest)
    } else {
        ("", raw)
    }
}

fn infer_level(message: &str) -> &'static str {
    let upper = message.to_ascii_uppercase();
    if upper.contains("ERROR") || upper.contains("FATAL") || upper.contains("PANIC") {
        "ERROR"
    } else if upper.contains("WARN") {
        "WARN"
    } else if upper.contains("DEBUG") || upper.contains("TRACE") {
        "DEBUG"
    } else {
        "INFO"
    }
}

pub(crate) fn map_bollard_error(err: bollard::errors::Error) -> AppError {
    let msg = err.to_string();
    let lower = msg.to_ascii_lowercase();
    let (code, retryable) = if lower.contains("connect")
        || lower.contains("no such file")
        || lower.contains("connection refused")
        || lower.contains("permission denied")
    {
        ("DOCKER_UNAVAILABLE", true)
    } else {
        ("DOCKER_ENGINE_FAILED", true)
    };
    AppError::coded(code, format!("docker engine error: {msg}"), Some(msg), retryable)
}
