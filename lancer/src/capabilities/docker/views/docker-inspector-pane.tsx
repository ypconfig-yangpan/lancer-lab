import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge, InspectorSection, PageTabs, PropertyList, StatusBadge } from "@lancer/ui";
import { useModuleSelectionStore } from "@/shell/presentation";
import { useReportInspectorSelection } from "@/shell/react/use-report-inspector-selection";
import { formatInstant } from "@/shared/lib/datetime";
import { inspectContainerWithFallback } from "../helpers/fallback";
import { DockerContainerWriteActions } from "./docker-container-write-actions";

const MODULE_ID = "docker";

/**
 * Product Inspector for Docker.
 * Overview first: Health + metadata + Ports/Mounts + Quick Actions.
 */
export function DockerInspectorPane() {
  const { t } = useTranslation();
  const selectedRowId = useModuleSelectionStore(
    (s) => s.byModule[MODULE_ID]?.selectedRowId ?? null,
  );
  useReportInspectorSelection(MODULE_ID, selectedRowId !== null);
  const [tab, setTab] = useState("overview");

  const query = useQuery({
    queryKey: ["docker", "inspect", selectedRowId],
    enabled: selectedRowId !== null,
    queryFn: async () => {
      if (selectedRowId === null) {
        return null;
      }
      const result = await inspectContainerWithFallback(selectedRowId);
      return result.row;
    },
  });

  if (selectedRowId === null) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-[13px] text-muted-foreground">
        {t("detail.noSelection")}
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-[13px] text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-[13px] text-destructive">
        {query.error instanceof Error ? query.error.message : "Failed to load container"}
      </div>
    );
  }

  const row = query.data;
  if (!row) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-[13px] text-muted-foreground">
        {t("detail.empty")}
      </div>
    );
  }

  const status = String(row.status ?? "—");
  const health = String(row.health ?? "—");
  const labels = row.labels ?? {};

  return (
    <div className="flex h-full flex-col bg-surface-2" key={String(row.id)}>
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 shadow-[inset_0_-1px_0_0_var(--border-subtle)]">
        <div className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold">
          {String(row.name ?? selectedRowId.slice(0, 12))}
        </div>
        <StatusBadge
          tone={
            /fail|error|exited/i.test(status)
              ? "danger"
              : /warn|pending/i.test(status)
                ? "warning"
                : "success"
          }
          label={status}
        />
      </div>

      <PageTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "inspect", label: "Inspect" },
        ]}
        className="shrink-0 px-3"
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "overview" ? (
          <>
            <DockerContainerWriteActions row={row} />

            <InspectorSection title="Health">
              <StatusBadge
                tone={
                  /unhealthy/i.test(health)
                    ? "danger"
                    : /healthy/i.test(health)
                      ? "success"
                      : "neutral"
                }
                label={health}
              />
            </InspectorSection>

            <InspectorSection title="Overview">
              <PropertyList
                items={[
                  {
                    label: "Image",
                    value: (
                      <span className="font-mono text-[12px]">{String(row.image ?? "—")}</span>
                    ),
                  },
                  {
                    label: "Image ID",
                    value: (
                      <span className="font-mono text-[12px]">{String(row.imageId ?? "—")}</span>
                    ),
                  },
                  {
                    label: "Created",
                    value: row.created ? formatInstant(String(row.created)) : "—",
                  },
                  {
                    label: "Command",
                    value: (
                      <span className="font-mono text-[12px]">{String(row.command ?? "—")}</span>
                    ),
                  },
                  { label: "Restart", value: String(row.restartPolicy ?? "—") },
                  { label: "Network", value: String(row.network ?? "—") },
                  {
                    label: "IP",
                    value: (
                      <span className="font-mono text-[12px]">{String(row.ipAddress ?? "—")}</span>
                    ),
                  },
                  {
                    label: "CPU",
                    value: <span className="font-mono text-[12px]">{String(row.cpu ?? "—")}</span>,
                  },
                  {
                    label: "Memory",
                    value: <span className="font-mono text-[12px]">{String(row.memory ?? "—")}</span>,
                  },
                  {
                    label: "Container ID",
                    value: (
                      <span className="font-mono text-[12px]">{String(row.id).slice(0, 12)}</span>
                    ),
                  },
                ]}
              />
            </InspectorSection>

            <InspectorSection title="Ports & Mounts">
              <PropertyList
                items={[
                  { label: "Ports", value: String(row.ports ?? "—") },
                  {
                    label: "Mounts",
                    value: (
                      <span className="whitespace-pre-wrap font-mono text-[12px]">
                        {String(row.mounts ?? "—")}
                      </span>
                    ),
                  },
                ]}
              />
            </InspectorSection>

            {Object.keys(labels).length > 0 ? (
              <InspectorSection title="Labels">
                <div className="flex flex-wrap gap-1">
                  {Object.entries(labels).map(([k, v]) => (
                    <Badge key={k} tone="accent">
                      {k}={v}
                    </Badge>
                  ))}
                </div>
              </InspectorSection>
            ) : null}
          </>
        ) : (
          <InspectorSection title="Inspect">
            <pre className="overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(
                {
                  id: row.id,
                  name: row.name,
                  image: row.image,
                  imageId: row.imageId,
                  status: row.status,
                  health: row.health,
                  command: row.command,
                  restartPolicy: row.restartPolicy,
                  network: row.network,
                  ipAddress: row.ipAddress,
                  ports: row.ports,
                  mounts: row.mounts,
                  labels: row.labels,
                },
                null,
                2,
              )}
            </pre>
          </InspectorSection>
        )}
      </div>
    </div>
  );
}
