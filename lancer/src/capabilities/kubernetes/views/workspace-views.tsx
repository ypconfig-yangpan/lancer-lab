import { PodExecPane } from "@/capabilities/kubernetes/views/pod-exec-pane";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { KubernetesLogsPane } from "@/capabilities/kubernetes/logs/kubernetes-logs-pane";
import { ResourceInspector } from "@/capabilities/kubernetes/tables/resource-inspector";
import { ResourceListPane } from "@/capabilities/kubernetes/tables/resource-list-pane";
import { KubernetesDemoInspector } from "@/capabilities/kubernetes/demo/kubernetes-demo-inspector";
import { KubernetesDemoLogsPane } from "@/capabilities/kubernetes/demo/kubernetes-demo-logs-pane";
import { KubernetesDemoResourcesView } from "@/capabilities/kubernetes/demo/kubernetes-demo-resources-view";

/** Live ResourceList when connected; catalog demo when not. */
export function KubernetesResourcesView() {
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  if (clusterId === null) {
    return <KubernetesDemoResourcesView />;
  }
  return <ResourceListPane />;
}

export function KubernetesInspectorView() {
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  if (clusterId === null) {
    return <KubernetesDemoInspector />;
  }
  return <ResourceInspector />;
}

export function KubernetesLogsView() {
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  if (clusterId === null) {
    return <KubernetesDemoLogsPane />;
  }
  return <KubernetesLogsPane />;
}

/** V2 Capability path — not plugin.apply. */
export function KubernetesExecView() {
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  if (clusterId === null) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        Connect a cluster to exec into a Pod
      </div>
    );
  }
  return <PodExecPane />;
}
