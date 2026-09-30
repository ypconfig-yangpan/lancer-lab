import { ConnectionsTree } from "./connections-tree";

/**
 * Workspace welcome for Connections — plain text + the same tool tree.
 */
export function ConnectionsHome() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6 text-[13px]">
      <div className="max-w-lg space-y-2">
        <h1 className="text-base font-semibold text-foreground">Connections</h1>
        <p className="text-muted-foreground">
          Pick a tool connection below to open its workspace. Kubernetes and Docker jump to their
          activities; Git and Jenkins are stubs for now.
        </p>
      </div>
      <ConnectionsTree className="max-w-sm" />
    </div>
  );
}
