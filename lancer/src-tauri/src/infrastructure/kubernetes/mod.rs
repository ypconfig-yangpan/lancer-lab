//! Kubernetes infrastructure port (kube-rs behind ClusterClientRegistry).

mod capabilities;
mod exec;
mod registry;
mod watch;

pub use exec::{PodExecManager, PodExecSessionDto};
pub use registry::{
    default_kubeconfig_path, ClusterClientRegistry, DeleteDeploymentResultDto, DeploymentSummaryDto,
    EventSummaryDto, ManifestResourceKind, PodSummaryDto, RestartDeploymentResultDto,
    ResourceYamlDto, ScaleDeploymentResultDto, ServiceSummaryDto, UpdateDeploymentImageResultDto,
};
pub use watch::{ResourceWatchKind, ResourceWatchManager};
