import { InspectorSection, PropertyList, StatusBadge } from "@lancer/ui";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/stores";
import { useReportInspectorSelection } from "@/shell/react/use-report-inspector-selection";
import { formatInstant } from "@/shared/lib/datetime";
import { K8S_DEMO_PODS } from "./demo-data";

/** Inspector for catalog demo pods (no live cluster). */
export function KubernetesDemoInspector() {
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  useReportInspectorSelection("kubernetes", selectedId !== null);

  const pod = K8S_DEMO_PODS.find((p) => p.uid === selectedId) ?? null;

  if (pod === null) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-[13px] text-muted-foreground">
        Select a demo pod
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <InspectorSection title="Overview">
        <PropertyList
          items={[
            { label: "Name", value: <span className="font-mono text-[12px]">{pod.name}</span> },
            { label: "Namespace", value: pod.namespace },
            {
              label: "Status",
              value: (
                <StatusBadge
                  tone={pod.phase === "Running" ? "running" : "warning"}
                  label={pod.phase}
                />
              ),
            },
            { label: "Ready", value: pod.ready },
            { label: "Restarts", value: String(pod.restarts) },
            { label: "Node", value: <span className="font-mono text-[12px]">{pod.nodeName}</span> },
            { label: "Created", value: formatInstant(pod.createdAt) },
          ]}
        />
      </InspectorSection>
      <InspectorSection title="Labels">
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          <span className="rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-muted-foreground">
            app={pod.name.replace(/-canary$/, "")}
          </span>
          <span className="rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-muted-foreground">
            tier=backend
          </span>
        </div>
      </InspectorSection>
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        Demo catalog — YAML / live detail after connect.
      </p>
    </div>
  );
}
