import type { ModuleContext } from "@/shell/types";
import { StubExplorerPane, StubResourcesPane, type StubRow } from "../stub/stub-tool-views";

const TREE = [{ id: "project:default", label: "library" }];
const ROWS: StubRow[] = [
  { id: "img-billing", name: "billing:1.4.2", status: "ready", detail: "Harbor stub" },
];

export function activateHarborCapability(context: ModuleContext): void {
  context.activities.register({
    id: "harbor",
    title: "Harbor",
    description: "Images",
    icon: "package",
    order: 70,
  });
  context.views.register({
    id: "harbor.explorer",
    title: "Projects",
    location: "explorer",
    factory: () => <StubExplorerPane title="Projects" items={TREE} />,
  });
  context.views.register({
    id: "harbor.resources",
    title: "Images",
    location: "workspace",
    factory: () => <StubResourcesPane title="Images (stub)" rows={ROWS} />,
  });
}
