import { useMemo, useState } from "react";
import { SearchInput } from "@lancer/ui";
import { useReportInspectorSelection } from "@/shell/react/use-report-inspector-selection";
import { cn } from "@/shared/lib/utils";
import { useApplicationWorkspaceStore } from "../application-workspace-store";
import { APPLICATION_CATALOG } from "../mock/mock-data";

/** Explorer: env-grouped application catalog (demo only — not product model). */
export function ApplicationExplorerView() {
  const selectedAppId = useApplicationWorkspaceStore((s) => s.selectedAppId);
  const setSelectedAppId = useApplicationWorkspaceStore((s) => s.setSelectedAppId);
  const [filter, setFilter] = useState("");
  useReportInspectorSelection("application", selectedAppId !== null);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const apps = APPLICATION_CATALOG.filter(
      (app) =>
        q.length === 0 ||
        app.name.toLowerCase().includes(q) ||
        app.env.toLowerCase().includes(q),
    );
    const order = ["DEV", "STAGING", "PROD"] as const;
    return order
      .map((group) => ({
        group,
        apps: apps.filter((a) => a.group === group),
      }))
      .filter((g) => g.apps.length > 0);
  }, [filter]);

  return (
    <div className="flex h-full flex-col gap-2 p-2 text-[13px]">
      <SearchInput
        placeholder="Filter apps…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-7"
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {groups.map(({ group, apps }) => (
          <div key={group} className="mb-2">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </div>
            <ul className="space-y-0.5">
              {apps.map((app) => {
                const active = app.id === selectedAppId;
                return (
                  <li key={app.id}>
                    <button
                      type="button"
                      className={cn(
                        "relative flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left transition-colors duration-[var(--transition-fast)] hover:bg-surface-hover",
                        active && "bg-surface-selected lancer-select-accent",
                      )}
                      onClick={() => {
                        setSelectedAppId(app.id);
                      }}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          app.status === "Healthy" ? "bg-success" : "bg-warning",
                        )}
                        title={app.status}
                        aria-label={app.status}
                      />
                      <span className="font-medium">{app.name}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">{app.env}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
