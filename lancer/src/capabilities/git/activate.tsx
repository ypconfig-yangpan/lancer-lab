import type { ModuleContext } from "@/shell/types";
import { StubExplorerPane, StubResourcesPane, type StubRow } from "../stub/stub-tool-views";

const TREE = [
  { id: "repo:billing", label: "billing" },
  { id: "repo:iam", label: "iam-service" },
];

const ROWS: StubRow[] = [
  { id: "br-billing-main", name: "main", status: "Clean", detail: "repo: billing · 3f2a1c7" },
  { id: "br-iam-dev", name: "develop", status: "Dirty", detail: "repo: iam-service · ahead 2" },
];

export function activateGitCapability(context: ModuleContext): void {
  context.activities.register({
    id: "git",
    title: "Git",
    description: "Repositories & branches",
    icon: "git-branch",
    order: 30,
  });
  context.views.register({
    id: "git.explorer",
    title: "Repositories",
    location: "explorer",
    factory: () => <StubExplorerPane title="Repositories" items={TREE} />,
  });
  context.views.register({
    id: "git.resources",
    title: "Branches",
    location: "workspace",
    factory: () => <StubResourcesPane title="Branches (stub)" rows={ROWS} />,
  });
}
