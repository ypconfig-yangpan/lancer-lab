import {
  Button,
  DataTableFrame,
  PageHeader,
  SearchInput,
  StatusBadge,
  dataTableRowClass,
} from "@lancer/ui";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/stores";
import { useReportInspectorSelection } from "@/shell/react/use-report-inspector-selection";
import { formatInstant } from "@/shared/lib/datetime";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";
import { K8S_DEMO_TREE, k8sDemoPodsForNamespace } from "./demo-data";

/** Workspace pods table from catalog when no cluster connected. */
export function KubernetesDemoResourcesView() {
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  const setSelected = useKubernetesWorkspaceStore((s) => s.setSelectedResourceId);
  const kind = useKubernetesWorkspaceStore((s) => s.resourceListKind);
  useReportInspectorSelection("kubernetes", selectedId !== null);

  const pods = kind === "pod" ? k8sDemoPodsForNamespace(namespace) : [];

  const title =
    kind === "pod" ? "Pods" : kind === "deployment" ? "Deployments" : "Services";

  return (
    <div className="flex h-full flex-col bg-surface-1">
      <PageHeader
        title={title}
        badge={String(pods.length)}
        status={`${K8S_DEMO_TREE.cluster} · demo`}
        statusTone="info"
        description="Catalog mock — connect a cluster for live list/watch."
        actions={
          <>
            <Button variant="secondary" size="sm">
              Refresh
            </Button>
            <Button size="sm">+ Create</Button>
          </>
        }
      />
      <DataTableFrame
        toolbar={
          <SearchInput className="h-7 w-48" placeholder="Search…" readOnly tabIndex={-1} />
        }
      >
        {kind !== "pod" ? (
          <div className="flex h-40 items-center justify-center px-4 text-[13px] text-muted-foreground">
            Demo catalog only ships Pods rows. Connect a cluster for Deployments / Services.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-border-subtle text-[11px] uppercase text-muted-foreground">
                <th className="h-9 px-3 font-semibold">Name</th>
                <th className="h-9 px-3 font-semibold">Namespace</th>
                <th className="h-9 px-3 font-semibold">Status</th>
                <th className="h-9 px-3 font-semibold">Ready</th>
                <th className="h-9 px-3 font-semibold">Restarts</th>
                <th className="h-9 px-3 font-semibold">Node</th>
                <th className="h-9 px-3 font-semibold">Age</th>
              </tr>
            </thead>
            <tbody>
              {pods.map((pod) => {
                const selected = pod.uid === selectedId;
                return (
                  <tr
                    key={pod.uid}
                    className={dataTableRowClass(selected)}
                    onClick={() => {
                      setSelected(pod.uid);
                      useWorkspaceStore.getState().setActiveBottomViewId("kubernetes.logs");
                    }}
                  >
                    <td className="h-11 px-3 font-mono text-[12px]">{pod.name}</td>
                    <td className="h-11 px-3">{pod.namespace}</td>
                    <td className="h-11 px-3">
                      <StatusBadge
                        tone={pod.phase === "Running" ? "running" : "warning"}
                        label={pod.phase}
                      />
                    </td>
                    <td className="h-11 px-3 font-mono text-[12px]">{pod.ready}</td>
                    <td className="h-11 px-3">{pod.restarts}</td>
                    <td className="h-11 px-3 font-mono text-[12px]">{pod.nodeName}</td>
                    <td className="h-11 px-3 text-muted-foreground">
                      {formatInstant(pod.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </DataTableFrame>
    </div>
  );
}
