import type { ModuleContext } from "@/shell/types";
import { StubExplorerPane, StubResourcesPane, type StubRow } from "../stub/stub-tool-views";

const TREE = [{ id: "app:billing", label: "billing" }];
const ROWS: StubRow[] = [
  { id: "app-billing", name: "billing", status: "Synced", detail: "Argo CD stub" },
];

export function activateArgocdCapability(context: ModuleContext): void {
  context.activities.register({
    id: "argocd",
    title: "Argo CD",
    description: "GitOps apps",
    icon: "rocket",
    order: 60,
  });
  context.views.register({
    id: "argocd.explorer",
    title: "Apps",
    location: "explorer",
    factory: () => <StubExplorerPane title="Applications" items={TREE} />,
  });
  context.views.register({
    id: "argocd.resources",
    title: "Applications",
    location: "workspace",
    factory: () => <StubResourcesPane title="Applications (stub)" rows={ROWS} />,
  });
}
