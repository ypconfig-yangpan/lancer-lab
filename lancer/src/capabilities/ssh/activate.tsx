import type { ModuleContext } from "@/shell/types";
import { StubExplorerPane, StubResourcesPane, type StubRow } from "../stub/stub-tool-views";

const TREE = [{ id: "host:bastion", label: "bastion" }];
const ROWS: StubRow[] = [
  { id: "sess-1", name: "bastion", status: "idle", detail: "ssh stub — not connected" },
];

export function activateSshCapability(context: ModuleContext): void {
  context.activities.register({
    id: "ssh",
    title: "SSH",
    description: "Remote sessions",
    icon: "terminal",
    order: 40,
  });
  context.views.register({
    id: "ssh.explorer",
    title: "Hosts",
    location: "explorer",
    factory: () => <StubExplorerPane title="Hosts" items={TREE} />,
  });
  context.views.register({
    id: "ssh.resources",
    title: "Sessions",
    location: "workspace",
    factory: () => <StubResourcesPane title="Sessions (stub)" rows={ROWS} />,
  });
}
