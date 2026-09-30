import type { ModuleContext } from "@/shell/types";
import { useApplicationWorkspaceStore } from "./application-workspace-store";
import { ApplicationExplorerView } from "./ui/application-explorer-view";
import { ApplicationInspectorView } from "./ui/application-inspector-view";
import { ApplicationWorkspaceView } from "./ui/application-workspace-view";

/** Demo Application workspace — not the product domain model. */
export function activateApplicationCapability(context: ModuleContext): void {
  context.activities.register({
    id: "applications",
    title: "Applications",
    description: "Demo application workspace",
    icon: "workflow",
    order: 5,
  });

  context.views.register({
    id: "application.workspace",
    title: "Applications",
    location: "workspace",
    factory: () => <ApplicationWorkspaceView />,
  });

  context.views.register({
    id: "application.explorer",
    title: "Apps",
    location: "explorer",
    factory: () => <ApplicationExplorerView />,
  });

  context.inspector.register({
    id: "application.inspector",
    title: "Application",
    factory: () => <ApplicationInspectorView />,
  });
}

export function deactivateApplicationCapability(): void {
  useApplicationWorkspaceStore.getState().reset?.();
}
