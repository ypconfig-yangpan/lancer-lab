import { MockConsolePane } from "@/shared/demo-ui/mock-console-pane";
import { useModuleSelectionStore } from "@/shell/presentation";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/stores";
import { useEffect } from "react";
import { K8S_DEMO_PODS } from "./demo-data";

/**
 * Demo logs: bridge k8s workspace selection → presentation store
 * so MockConsolePane can reuse the shared catalog console.
 */
export function KubernetesDemoLogsPane() {
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);

  useEffect(() => {
    useModuleSelectionStore
      .getState()
      .setSelectedRow("kubernetes", selectedId);
  }, [selectedId]);

  return (
    <MockConsolePane
      moduleId="kubernetes"
      title="Pod Logs"
      emptyHint="No Selection — pick a demo pod"
      dark
      linesWhenSelected={(rowId) => {
        const pod = K8S_DEMO_PODS.find((p) => p.uid === rowId);
        const name = pod?.name ?? rowId;
        return [
          { level: "INFO", message: `Streaming logs for ${name}…` },
          { level: "INFO", message: "Listening on :8080" },
          { level: "DEBUG", message: "healthz ok" },
          { level: "WARN", message: "slow query 320ms" },
          { level: "INFO", message: "request id=demo-1 status=200" },
          { level: "DEBUG", message: "Catalog mock — no kube follow (Phase 2.2b)" },
        ];
      }}
    />
  );
}
