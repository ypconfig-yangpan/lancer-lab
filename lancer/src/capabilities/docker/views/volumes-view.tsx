import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  dataTableRowClass,
  DataTableFrame,
  PageHeader,
  SearchInput,
  StatusBadge,
} from "@lancer/ui";
import type { NativeDockerVolumeSummary } from "@/native/docker";
import { dockerApi } from "../api/client";
import { useDockerWorkspaceStore } from "../docker-workspace-store";

/**
 * Docker Volumes workspace: list + remove.
 */
export function DockerVolumesView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const engineStatus = useDockerWorkspaceStore((s) => s.engineStatus);
  const [filter, setFilter] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<NativeDockerVolumeSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["docker", "volumes"],
    queryFn: () => dockerApi.listVolumes(),
    refetchInterval: 12_000,
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (name: string) => dockerApi.removeVolume(name, { force: true }),
    onSuccess: async (result) => {
      setConfirmRemove(null);
      setSelectedName(null);
      setActionError(null);
      setActionOk(`Removed ${result.volume}`);
      await queryClient.invalidateQueries({ queryKey: ["docker", "volumes"] });
    },
    onError: (err: unknown) => {
      setActionOk(null);
      setActionError(err instanceof Error ? err.message : String(err));
    },
  });

  const rows = useMemo(() => {
    const list = query.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) {
      return list;
    }
    return list.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.driver.toLowerCase().includes(q) ||
        row.mountpoint.toLowerCase().includes(q),
    );
  }, [filter, query.data]);

  const offline = engineStatus === "offline";

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-[13px] text-muted-foreground">
        Loading volumes…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-[13px]">
        <p className="text-destructive">
          {query.error instanceof Error ? query.error.message : "Failed to load volumes"}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-1">
      <PageHeader
        title="Volumes"
        badge={String(rows.length)}
        status={offline ? "Engine offline" : "Docker local"}
        statusTone={offline ? "warning" : "success"}
        description="List local volumes · remove unused"
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
      {actionOk ? (
        <div className="border-b border-border-subtle px-3 py-1 text-[12px] text-muted-foreground">
          {actionOk}
        </div>
      ) : null}

      {confirmRemove ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-destructive/30 bg-surface-2 px-3 py-2 text-[12px]">
          <span>
            Remove volume <span className="font-mono">{confirmRemove.name}</span>?
          </span>
          <Button
            size="sm"
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate(confirmRemove.name)}
          >
            {remove.isPending ? "Removing…" : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => setConfirmRemove(null)}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      <DataTableFrame
        className="min-h-0 flex-1"
        toolbar={
          <div className="flex items-center gap-2">
            <SearchInput
              className="h-7 w-52"
              placeholder="Filter name / driver…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <StatusBadge tone={offline ? "warning" : "success"} label={offline ? "offline" : "live"} />
          </div>
        }
      >
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-[13px] text-muted-foreground">
            {offline ? t("explorer.engineOfflineEmpty") : "No volumes"}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface-1">
              <tr className="border-b border-border-subtle">
                {["Name", "Driver", "Mountpoint", "Size", "Created", ""].map((h) => (
                  <th
                    key={h || "actions"}
                    className="h-9 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = row.name === selectedName;
                return (
                  <tr
                    key={row.name}
                    className={dataTableRowClass(selected)}
                    onClick={() => setSelectedName(row.name)}
                  >
                    <td className="h-11 px-3 align-middle font-mono text-[12px]">{row.name}</td>
                    <td className="h-11 px-3 align-middle text-[12px]">{row.driver}</td>
                    <td
                      className="h-11 max-w-[280px] truncate px-3 align-middle font-mono text-[11px] text-muted-foreground"
                      title={row.mountpoint}
                    >
                      {row.mountpoint || "—"}
                    </td>
                    <td className="h-11 px-3 align-middle font-mono text-[12px]">{row.size}</td>
                    <td className="h-11 px-3 align-middle text-[12px] text-muted-foreground">
                      {row.created || "—"}
                    </td>
                    <td className="h-11 px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-destructive"
                          disabled={remove.isPending || offline}
                          onClick={() => {
                            setSelectedName(row.name);
                            setConfirmRemove(row);
                            setActionError(null);
                            setActionOk(null);
                          }}
                        >
                          Delete
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
