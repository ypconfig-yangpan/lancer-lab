import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  dataTableRowClass,
  DataTableFrame,
  PageHeader,
  SearchInput,
  StatusBadge,
  type StatusTone,
} from "@lancer/ui";
import { useModuleSelectionStore } from "@/shell/presentation";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";
import { dockerApi } from "../api/client";
import {
  type DockerContainerGroup,
  useDockerWorkspaceStore,
} from "../docker-workspace-store";
import { listContainersWithFallback } from "../helpers/fallback";
import type { DockerContainerRow } from "../helpers/mock-data";

const MODULE_ID = "docker";
const EMPTY_FILTER: Record<string, string> = {};

function statusToneFromLabel(text: string): StatusTone {
  const t = text.toLowerCase();
  if (t.includes("running") || t.includes("healthy") || t.includes("success")) {
    return t.includes("running") ? "running" : "success";
  }
  if (t.includes("warn") || t.includes("pending")) {
    return "warning";
  }
  if (t.includes("fail") || t.includes("error") || t.includes("exit") || t.includes("unhealthy")) {
    return "danger";
  }
  return "neutral";
}

function hasRealStat(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const v = value.trim();
  return v.length > 0 && v !== "—";
}

/**
 * Containers table via dockerApi.
 * Chain: browse → select → inspector / logs / exec / lifecycle.
 */
export function DockerResourcesView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const filter = useModuleSelectionStore(
    (s) => s.byModule[MODULE_ID]?.filter ?? EMPTY_FILTER,
  );
  const selectedRowId = useModuleSelectionStore(
    (s) => s.byModule[MODULE_ID]?.selectedRowId ?? null,
  );
  const setSelectedRow = useModuleSelectionStore((s) => s.setSelectedRow);
  const setActiveBottomViewId = useWorkspaceStore((s) => s.setActiveBottomViewId);
  const nameFilter = useDockerWorkspaceStore((s) => s.nameFilter);
  const setNameFilter = useDockerWorkspaceStore((s) => s.setNameFilter);
  const groupChip = useDockerWorkspaceStore((s) => s.containerGroup);
  const setGroupChip = useDockerWorkspaceStore((s) => s.setContainerGroup);
  const engineStatus = useDockerWorkspaceStore((s) => s.engineStatus);
  const [sortField, setSortField] = useState<keyof DockerContainerRow>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  const groupFromTree = typeof filter.group === "string" ? filter.group : undefined;
  const isPlaceholderKind = groupFromTree === "images" || groupFromTree === "volumes";

  const query = useQuery({
    queryKey: ["docker", "containers", filter],
    queryFn: () => listContainersWithFallback(filter),
    refetchInterval: 8_000,
  });

  const lifecycle = useMutation({
    mutationFn: async (input: {
      id: string;
      action: "start" | "stop" | "restart";
    }) => {
      if (input.action === "start") {
        return dockerApi.startContainer(input.id);
      }
      if (input.action === "stop") {
        return dockerApi.stopContainer(input.id);
      }
      return dockerApi.restartContainer(input.id);
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["docker"] });
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : String(err));
    },
  });

  const selectRow = useCallback(
    (rowId: string) => {
      setSelectedRow(MODULE_ID, rowId);
    },
    [setSelectedRow],
  );

  const openLogs = useCallback(
    (rowId: string) => {
      setSelectedRow(MODULE_ID, rowId);
      setActiveBottomViewId("docker.logs");
    },
    [setActiveBottomViewId, setSelectedRow],
  );

  const openTerminal = useCallback(
    (rowId: string) => {
      setSelectedRow(MODULE_ID, rowId);
      setActiveBottomViewId("docker.terminal");
    },
    [setActiveBottomViewId, setSelectedRow],
  );

  const rows = useMemo(() => {
    const list = query.data?.rows ?? [];
    const q = nameFilter.trim().toLowerCase();
    const filtered = list.filter((row) => {
      if (groupChip !== "all" && row.group !== groupChip) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        row.name.toLowerCase().includes(q) ||
        row.image.toLowerCase().includes(q) ||
        row.status.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      const av = String(a[sortField] ?? "");
      const bv = String(b[sortField] ?? "");
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [groupChip, nameFilter, query.data?.rows, sortAsc, sortField]);

  const showCpu = rows.some((r) => hasRealStat(r.cpu));
  const showMemory = rows.some((r) => hasRealStat(r.memory));

  const columns: {
    id: string;
    header: string;
    field: keyof DockerContainerRow;
    mono?: boolean;
    status?: boolean;
  }[] = [
    { id: "name", header: "Name", field: "name", mono: true },
    { id: "status", header: "Status", field: "status", status: true },
    { id: "ports", header: "Ports", field: "ports" },
    { id: "image", header: "Image", field: "image", mono: true },
    ...(showCpu ? [{ id: "cpu", header: "CPU", field: "cpu" as const }] : []),
    ...(showMemory ? [{ id: "memory", header: "Memory", field: "memory" as const }] : []),
  ];

  if (isPlaceholderKind) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-[13px] text-muted-foreground">
        <p className="font-medium text-foreground">
          {groupFromTree === "images" ? "Images" : "Volumes"}
        </p>
        <p>{t("explorer.comingSoon")}</p>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-[13px] text-muted-foreground">
        Loading containers…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-[13px]">
        <p className="text-destructive">
          {query.error instanceof Error ? query.error.message : "Failed to load containers"}
        </p>
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const source = query.data?.source ?? "native";
  const offline = source === "mock" || engineStatus === "offline";

  return (
    <div className="flex h-full flex-col bg-surface-1">
      <PageHeader
        title="Containers"
        badge={String(rows.length)}
        status={offline ? "Engine offline" : "Docker local"}
        statusTone={offline ? "warning" : "success"}
        description={
          selectedRowId
            ? `1 selected · ${selectedRowId.slice(0, 12)}`
            : groupChip === "all"
              ? "All containers"
              : `${groupChip} only`
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        }
      />
      {actionError ? (
        <div className="border-b border-border-subtle px-3 py-1 text-[12px] text-destructive">
          {actionError}
        </div>
      ) : null}
      <DataTableFrame
        className="min-h-0 flex-1"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              className="h-7 w-44"
              placeholder="Filter name / image…"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
            <div className="flex gap-1">
              {(["all", "running", "exited"] as const).map((chip) => (
                <Button
                  key={chip}
                  size="sm"
                  variant={groupChip === chip ? "secondary" : "ghost"}
                  className="h-7 px-2 capitalize"
                  onClick={() => setGroupChip(chip as DockerContainerGroup)}
                >
                  {chip}
                </Button>
              ))}
            </div>
            <StatusBadge
              tone={offline ? "warning" : "success"}
              label={offline ? "offline" : "live"}
            />
          </div>
        }
      >
        {rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-[13px] text-muted-foreground">
            <p>
              {offline
                ? t("explorer.engineOfflineEmpty")
                : nameFilter || groupChip !== "all"
                  ? "No containers match filter"
                  : "No containers"}
            </p>
            {offline ? (
              <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface-1">
              <tr className="border-b border-border-subtle">
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className="h-9 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={() => {
                        if (sortField === col.field) {
                          setSortAsc((v) => !v);
                        } else {
                          setSortField(col.field);
                          setSortAsc(true);
                        }
                      }}
                    >
                      {col.header}
                    </button>
                  </th>
                ))}
                <th className="h-9 px-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = row.id === selectedRowId;
                const running = /running/i.test(row.status);
                return (
                  <tr
                    key={row.id}
                    className={dataTableRowClass(selected)}
                    onClick={() => selectRow(row.id)}
                    onDoubleClick={() => openLogs(row.id)}
                  >
                    {columns.map((col) => {
                      const text = String(row[col.field] ?? "—");
                      return (
                        <td key={col.id} className="h-11 px-3 align-middle">
                          {col.status ? (
                            <StatusBadge tone={statusToneFromLabel(text)} label={text} />
                          ) : col.mono ? (
                            <span className="font-mono text-[12px]">{text}</span>
                          ) : (
                            <span className="font-mono text-[12px] text-muted-foreground">
                              {text}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="h-11 px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => openLogs(row.id)}
                        >
                          {t("explorer.openLogs")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          disabled={!running}
                          onClick={() => openTerminal(row.id)}
                        >
                          {t("explorer.openTerminal")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          disabled={lifecycle.isPending || offline}
                          onClick={() =>
                            lifecycle.mutate({
                              id: row.id,
                              action: running ? "stop" : "start",
                            })
                          }
                        >
                          {running ? "Stop" : "Start"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </DataTableFrame>
    </div>
  );
}
