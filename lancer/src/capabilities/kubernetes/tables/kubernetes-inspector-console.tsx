import { KubernetesLogsPane } from "@/capabilities/kubernetes/logs/kubernetes-logs-pane";

/**
 * Inspector bottom strip — logs first. Terminal stays in workspace「更多」入口。
 */
export function KubernetesInspectorConsole() {
  return (
    <div className="flex h-full min-h-0 flex-col border-t border-border-subtle bg-[#f7f8fa] p-2">
      <KubernetesLogsPane embedded />
    </div>
  );
}
