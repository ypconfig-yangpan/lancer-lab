import { useState, type ReactNode } from "react";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/stores";
import { cn } from "@/shared/lib/utils";
import { useTabsStore } from "@/shared/stores/tabs-store";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";

type ToolId = "kubernetes" | "docker" | "git" | "jenkins";

interface ToolNode {
  id: ToolId;
  label: string;
}

const TOOLS: ToolNode[] = [
  { id: "kubernetes", label: "Kubernetes" },
  { id: "docker", label: "Docker" },
  { id: "git", label: "Git" },
  { id: "jenkins", label: "Jenkins" },
];

function openToolActivity(activityId: string): void {
  useWorkspaceStore.getState().setActiveActivityId(activityId);
}

function openDockerLocal(): void {
  openToolActivity("docker");
  useTabsStore.getState().openWorkspaceTab(
    {
      id: "docker:docker.resources",
      viewId: "docker.resources",
      moduleId: "docker",
      title: "Containers",
    },
    "preview",
  );
}

function ToolLeaves({ tool }: { tool: ToolNode }) {
  const activeCluster = useKubernetesWorkspaceStore((s) => s.activeCluster);

  if (tool.id === "kubernetes") {
    if (activeCluster) {
      return (
        <LeafButton onClick={() => openToolActivity("kubernetes")}>
          {activeCluster.displayName}
        </LeafButton>
      );
    }
    return (
      <>
        <li className="px-2 py-0.5 text-[11px] text-muted-foreground">
          Configure in Kubernetes activity
        </li>
        <LeafButton onClick={() => openToolActivity("kubernetes")}>local</LeafButton>
      </>
    );
  }

  if (tool.id === "docker") {
    return <LeafButton onClick={() => openDockerLocal()}>local</LeafButton>;
  }

  return <li className="px-2 py-0.5 text-[12px] text-muted-foreground">(not configured)</li>;
}

function LeafButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="relative flex h-7 w-full items-center rounded-[6px] px-2 text-left text-[12px] hover:bg-surface-hover"
        onClick={onClick}
      >
        {children}
      </button>
    </li>
  );
}

/**
 * Plain tool-connection tree. Leaf clicks switch to that tool's activity.
 */
export function ConnectionsTree({ className }: { className?: string }) {
  const [open, setOpen] = useState<Record<ToolId, boolean>>({
    kubernetes: true,
    docker: true,
    git: true,
    jenkins: true,
  });

  const toggle = (id: ToolId) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className={cn("text-[13px]", className)}>
      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Connections
      </div>
      <ul className="space-y-0.5">
        {TOOLS.map((tool) => (
          <li key={tool.id}>
            <button
              type="button"
              className="flex w-full items-center gap-1 rounded-[6px] px-2 py-1 text-left hover:bg-surface-hover"
              onClick={() => toggle(tool.id)}
            >
              <span className="text-muted-foreground">{open[tool.id] ? "▾" : "▸"}</span>
              <span className="font-medium">{tool.label}</span>
            </button>
            {open[tool.id] ? (
              <ul className="ml-3 space-y-0.5 border-l border-border-subtle pl-2">
                <ToolLeaves tool={tool} />
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
