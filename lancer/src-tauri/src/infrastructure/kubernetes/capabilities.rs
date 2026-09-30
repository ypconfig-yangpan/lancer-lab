use k8s_openapi::api::authorization::v1::{
    ResourceAttributes, SelfSubjectAccessReview, SelfSubjectAccessReviewSpec,
};
use kube::api::PostParams;
use kube::{Api, Client};
use tracing::warn;

use crate::domain::cluster::ClusterCapabilities;

/// Probe a fixed set of verbs for future write/exec UI gating.
/// Failures degrade to denied flags (do not fail connect).
pub async fn probe_capabilities(
    client: Client,
    readonly: bool,
    namespace: Option<&str>,
) -> ClusterCapabilities {
    let ns = namespace.filter(|s| !s.is_empty());
    let mut caps = ClusterCapabilities {
        can_list_pods: review(client.clone(), "", "pods", "list", ns).await,
        can_get_pods: review(client.clone(), "", "pods", "get", ns).await,
        can_delete_pods: review(client.clone(), "", "pods", "delete", ns).await,
        can_patch_deployments: review(client.clone(), "apps", "deployments", "patch", ns).await,
        can_delete_deployments: review(client.clone(), "apps", "deployments", "delete", ns).await,
        can_create_pods_exec: review(client.clone(), "", "pods/exec", "create", ns).await,
        can_get_pods_log: review(client.clone(), "", "pods/log", "get", ns).await,
        ssar_ok: true,
    };

    if readonly {
        caps = caps.force_readonly();
    }
    caps
}

async fn review(
    client: Client,
    group: &str,
    resource: &str,
    verb: &str,
    namespace: Option<&str>,
) -> bool {
    let api: Api<SelfSubjectAccessReview> = Api::all(client);
    let body = SelfSubjectAccessReview {
        metadata: Default::default(),
        spec: SelfSubjectAccessReviewSpec {
            resource_attributes: Some(ResourceAttributes {
                group: Some(group.to_string()),
                resource: Some(resource.to_string()),
                verb: Some(verb.to_string()),
                namespace: namespace.map(str::to_string),
                ..Default::default()
            }),
            ..Default::default()
        },
        status: None,
    };

    match api.create(&PostParams::default(), &body).await {
        Ok(res) => res.status.map(|s| s.allowed).unwrap_or(false),
        Err(err) => {
            warn!(
                target: "lancer::k8s",
                group,
                resource,
                verb,
                error = %err,
                "SSAR probe failed; treating as denied"
            );
            false
        }
    }
}
