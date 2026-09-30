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
import type { NativeDockerImageSummary } from "@/native/docker";
import { dockerApi } from "../api/client";
import { useDockerWorkspaceStore } from "../docker-workspace-store";

function shortId(id: string): string {
  const bare = id.replace(/^sha256:/, "");
  return bare.length > 12 ? bare.slice(0, 12) : bare;
}

function formatCreated(epochSeconds: number): string {
  if (!epochSeconds) {
    return "—";
  }
  try {
    return new Date(epochSeconds * 1000).toLocaleString();
  } catch {
    return String(epochSeconds);
  }
}

/**
 * Docker Images workspace: list + pull + remove.
 */
export function DockerImagesView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const engineStatus = useDockerWorkspaceStore((s) => s.engineStatus);
  const [filter, setFilter] = useState("");
  const [pullRef, setPullRef] = useState("nginx:alpine");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<NativeDockerImageSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["docker", "images"],
    queryFn: () => dockerApi.listImages(),
    refetchInterval: 12_000,
    retry: false,
  });

  const pull = useMutation({
    mutationFn: (reference: string) => dockerApi.pullImage(reference.trim()),
    onSuccess: async (result) => {
      setActionError(null);
      setActionOk(`Pulled ${result.image}`);
      await queryClient.invalidateQueries({ queryKey: ["docker", "images"] });
    },
    onError: (err: unknown) => {
      setActionOk(null);
      setActionError(err instanceof Error ? err.message : String(err));
    },
  });

  const remove = useMutation({
    mutationFn: (image: string) => dockerApi.removeImage(image, { force: true }),
    onSuccess: async (result) => {
      setConfirmRemove(null);
      setSelectedId(null);
      setActionError(null);
      setActionOk(`Removed ${result.image}`);
      await queryClient.invalidateQueries({ queryKey: ["docker", "images"] });
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
        row.tag.toLowerCase().includes(q) ||
        row.tags.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q),
    );
  }, [filter, query.data]);

  const offline = engineStatus === "offline";

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-3 text-[13px] text-muted-foreground">
        Loading images…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-[13px]">
        <p className="text-destructive">
          {query.error instanceof Error ? query.error.message : "Failed to load images"}
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
        title="Images"
        badge={String(rows.length)}
        status={offline ? "Engine offline" : "Docker local"}
        statusTone={offline ? "warning" : "success"}
        description="Pull from registry · remove local images"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
        <input
          className="h-8 min-w-[220px] flex-1 rounded-[6px] border border-input bg-background px-2 font-mono text-[12px]"
          placeholder="nginx:alpine"
          value={pullRef}
          onChange={(e) => setPullRef(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pullRef.trim() && !pull.isPending) {
              pull.mutate(pullRef);
            }
          }}
        />
        <Button
          size="sm"
          disabled={!pullRef.trim() || pull.isPending || offline}
          onClick={() => pull.mutate(pullRef)}
        >
          {pull.isPending ? "Pulling…" : "Pull"}
        </Button>
      </div>

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
            Remove <span className="font-mono">{confirmRemove.tag}</span>?
          </span>
          <Button
            size="sm"
            variant="danger"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(
                confirmRemove.tag.startsWith("<") || confirmRemove.tag === shortId(confirmRemove.id)
                  ? confirmRemove.id
                  : confirmRemove.tag,
              )
            }
          >
            {remove.isPending ? "Removing…" : "Confirm"}
          </Button>
          <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => setConfirmRemove(null)}>
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
              placeholder="Filter tag / id…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <StatusBadge tone={offline ? "warning" : "success"} label={offline ? "offline" : "live"} />
          </div>
        }
      >
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-[13px] text-muted-foreground">
            {offline ? t("explorer.engineOfflineEmpty") : "No images"}
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface-1">
              <tr className="border-b border-border-subtle">
                {["Repository:Tag", "ID", "Size", "Created", ""].map((h) => (
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
                const selected = row.id === selectedId;
                return (
                  <tr
                    key={`${row.id}:${row.tag}`}
                    className={dataTableRowClass(selected)}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="h-11 px-3 align-middle">
                      <span className="font-mono text-[12px]">{row.tag}</span>
                      {row.tags.includes(",") ? (
                        <div className="text-[11px] text-muted-foreground">{row.tags}</div>
                      ) : null}
                    </td>
                    <td className="h-11 px-3 align-middle font-mono text-[12px] text-muted-foreground">
                      {shortId(row.id)}
                    </td>
                    <td className="h-11 px-3 align-middle font-mono text-[12px]">{row.size}</td>
                    <td className="h-11 px-3 align-middle text-[12px] text-muted-foreground">
                      {formatCreated(row.created)}
                    </td>
                    <td className="h-11 px-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-destructive"
                          disabled={remove.isPending || offline}
                          onClick={() => {
                            setSelectedId(row.id);
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
