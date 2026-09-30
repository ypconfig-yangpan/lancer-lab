import type { ModuleContext } from "@/shell/types";
import { DockerDashboardApp } from "./views/docker-dashboard-app";

/**
 * Docker capability — Mock Dashboard UI (no local engine IPC on this path).
 */
export function activateDockerCapability(context: ModuleContext): void {
  context.views.register({
    id: "docker.resources",
    title: "Docker",
    location: "workspace",
    factory: () => <DockerDashboardApp />,
  });
}

export function deactivateDockerCapability(): void {
  // no-op for mock path
}
