import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button, StatusBadge } from "@lancer/ui";
import { useModuleSelectionStore } from "@/shell/presentation";
import type { NativeDockerLogLine } from "@/native/docker";
import { cn } from "@/shared/lib/utils";
import { containerLogsWithFallback, listContainersWithFallback } from "../helpers/fallback";

const MODULE_ID = "docker";

const LEVEL_CLASS: Record<string, string> = {
  INFO: "text-log-info",
  WARN: "text-log-warning",
  ERROR: "text-log-error",
  DEBUG: "text-muted-foreground",
};

/**
 * Bottom Logs: selected container → dockerApi.containerLogs.
 */
export function DockerLogsPane() {
  const { t } = useTranslation();
  const selectedRowId = useModuleSelectionStore(
    (s) => s.byModule[MODULE_ID]?.selectedRowId ?? null,
  );
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const containersQuery = useQuery({
    queryKey: ["docker", "containers", "for-logs"],
    queryFn: () => listContainersWithFallback({}),
    staleTime: 8_000,
  });

  const containerName =
    containersQuery.data?.rows.find((r) => r.id === selectedRowId)?.name ??
    (selectedRowId ? selectedRowId.slice(0, 12) : null);

  const logsQuery = useQuery({
    queryKey: ["docker", "logs", selectedRowId],
    enabled: selectedRowId !== null,
    queryFn: async () => {
      if (selectedRowId === null) {
        return { lines: [] as NativeDockerLogLine[], source: "native" as const };
      }
      return containerLogsWithFallback({
        containerId: selectedRowId,
        tail: 300,
      });
    },
    refetchInterval: selectedRowId !== null ? 3_000 : false,
  });

  const lines = logsQuery.data?.lines ?? [];
  const source = logsQuery.data?.source ?? "native";

  useEffect(() => {
    const el = bottomRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines.length, selectedRowId]);

  if (selectedRowId === null) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        {t("explorer.selectContainer")}
      </div>
    );
  }

  if (logsQuery.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-[13px]">
        <p className="text-destructive">
          {logsQuery.error instanceof Error ? logsQuery.error.message : "logs failed"}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void logsQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-[12px]">
        <span className="font-medium">Container Logs</span>
        <span className="font-mono text-muted-foreground">{containerName}</span>
        <StatusBadge
          tone={source === "mock" ? "warning" : "success"}
          label={source === "mock" ? "offline" : "live"}
        />
        <span className="text-muted-foreground">{lines.length} lines</span>
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto h-7"
          onClick={() => void logsQuery.refetch()}
        >
          Refresh
        </Button>
      </div>
      <div
        ref={bottomRef}
        className="min-h-0 flex-1 overflow-auto bg-surface-2 px-3 py-2 font-mono text-[12px]"
      >
        {logsQuery.isLoading && lines.length === 0 ? (
          <div className="text-muted-foreground">Loading logs…</div>
        ) : lines.length === 0 ? (
          <div className="text-muted-foreground">No log lines</div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="flex gap-2 whitespace-pre-wrap">
              <span className="w-10 shrink-0 text-muted-foreground">{line.lineNumber}</span>
              {line.timestamp ? (
                <span className="w-40 shrink-0 text-muted-foreground">
                  {line.timestamp.slice(11, 23)}
                </span>
              ) : null}
              <span className={cn("w-12 shrink-0", LEVEL_CLASS[line.level] ?? "")}>
                {line.level}
              </span>
              <span className="min-w-0 flex-1">{line.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
