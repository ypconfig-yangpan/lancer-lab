import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { kubernetesApi } from "@/capabilities/kubernetes/api";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import {
  useDeployments,
  usePods,
  useServices,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { LogViewer } from "@/capabilities/kubernetes/logs/log-viewer";
import { resolveLogTarget } from "@/capabilities/kubernetes/logs/resolve-log-target";
import { useK8sUiStore } from "@/capabilities/kubernetes/mock/k8s-ui-store";
import { CompactSelect } from "@/components/ui/compact-select";
import type { LogLine } from "@/entities/log/types";
import { cn } from "@/shared/lib/utils";

const WINDOW_LIMIT = 10_000;
const MANAGED_LOG_APPENDED_EVENT = "managed-log-appended";

interface ManagedLogAppendedPayload {
  sessionId: string;
  totalLines: number;
  status: string;
}

/**
 * Live Logs: kubernetesApi → Disk-as-Source.
 * Pod / Service / Deployment → resolve backing Pod (+ optional container).
 */
export function KubernetesLogsPane({
  embedded = false,
  defaultCollapsed = false,
  enableFullscreen = true,
  enableCollapse = true,
  allowServiceSwitch = false,
  allowPodSwitch = false,
  focusedPodUid = null,
  onFocusedPodUidChange,
  density = "comfortable",
  expandedClassName,
}: {
  /** Dashboard / inspector chrome. */
  embedded?: boolean;
  /** Homepage: start as header strip. */
  defaultCollapsed?: boolean;
  enableFullscreen?: boolean;
  enableCollapse?: boolean;
  /** Switch Deployment in toolbar. */
  allowServiceSwitch?: boolean;
  /** Switch Pod within current workload. */
  allowPodSwitch?: boolean;
  /** Controlled pod focus (e.g. click from Pod 详情). */
  focusedPodUid?: string | null;
  onFocusedPodUidChange?: (uid: string | null) => void;
  density?: "comfortable" | "dock";
  /** Height class when expanded (terminal variant). */
  expandedClassName?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  const kind = useKubernetesWorkspaceStore((s) => s.resourceListKind);
  const setSelectedResourceId = useKubernetesWorkspaceStore((s) => s.setSelectedResourceId);
  const selectDeployment = useK8sUiStore((s) => s.selectDeployment);

  const podsQuery = usePods(clusterId, namespace, { enabled: clusterId !== null });
  const deploymentsQuery = useDeployments(clusterId, namespace, {
    enabled: clusterId !== null && (kind === "deployment" || embedded),
  });
  const servicesQuery = useServices(clusterId, namespace, {
    enabled: clusterId !== null && kind === "service",
  });

  const deployments = deploymentsQuery.data ?? [];

  const resolved = useMemo(
    () =>
      resolveLogTarget({
        kind,
        selectedId,
        pods: podsQuery.data ?? [],
        deployments,
        services: servicesQuery.data ?? [],
      }),
    [deployments, kind, podsQuery.data, selectedId, servicesQuery.data],
  );

  const [logPodUid, setLogPodUid] = useState<string | null>(null);
  const [container, setContainer] = useState<string>("");

  useEffect(() => {
    if (focusedPodUid) {
      setLogPodUid(focusedPodUid);
      return;
    }
    setLogPodUid(resolved.preferred?.uid ?? null);
  }, [focusedPodUid, resolved.preferred?.uid, selectedId, kind]);

  const pickPod = (uid: string) => {
    setLogPodUid(uid);
    onFocusedPodUidChange?.(uid);
  };

  const activePod =
    resolved.pods.find((p) => p.uid === logPodUid) ?? resolved.preferred ?? null;

  useEffect(() => {
    const first = activePod?.containers[0] ?? "";
    setContainer(first);
  }, [activePod?.uid, activePod?.containers]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [previous, setPrevious] = useState(false);
  /** 0 = all (no since); else seconds */
  const [sinceSeconds, setSinceSeconds] = useState(0);
  const [tailLines, setTailLines] = useState(5_000);
  /** 1-based line center for Search seek; null = follow tail / windowStart. */
  const [seekLine, setSeekLine] = useState<number | null>(null);
  /** 0-based fixed window start when browsing history; null = pin to live tail. */
  const [windowStart, setWindowStart] = useState<number | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  /** Keep last window while reconnecting (do not flash empty). */
  const [staleLines, setStaleLines] = useState<LogLine[]>([]);
  const [staleTotal, setStaleTotal] = useState(0);

  useEffect(() => {
    if (clusterId === null || activePod === null) {
      setSessionId(null);
      setOpenError(null);
      setStreamStatus(null);
      setStaleLines([]);
      setStaleTotal(0);
      return;
    }

    let cancelled = false;
    let openedId: string | null = null;
    void (async () => {
      try {
        setOpenError(null);
        setStreamStatus("following");
        const opened = await kubernetesApi.openLogs({
          connectionId: clusterId,
          namespace: activePod.namespace,
          pod: activePod.name,
          follow: true,
          previous,
          ...(sinceSeconds > 0 ? { sinceSeconds } : {}),
          ...(sinceSeconds > 0 ? {} : { tailLines }),
          ...(container ? { container } : {}),
        });
        openedId = opened.sessionId;
        if (cancelled) {
          await kubernetesApi.closeLogs(opened.sessionId);
          return;
        }
        setSessionId(opened.sessionId);
        setSeekLine(null);
        setWindowStart(null);
        const info = await kubernetesApi.getLogSession(opened.sessionId);
        if (!cancelled) {
          setStreamStatus(info.status);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setSessionId(null);
          setStreamStatus("error");
          setOpenError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (openedId !== null) {
        void kubernetesApi.closeLogs(openedId);
      }
    };
  }, [
    clusterId,
    activePod?.namespace,
    activePod?.name,
    container,
    previous,
    sinceSeconds,
    tailLines,
    reconnectKey,
  ]);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    let unlisten: (() => void) | undefined;
    void listen<ManagedLogAppendedPayload>(MANAGED_LOG_APPENDED_EVENT, (event) => {
      if (event.payload.sessionId !== sessionId) {
        return;
      }
      setStreamStatus(event.payload.status);
      void queryClient.invalidateQueries({
        queryKey: ["kubernetes", "logs", "window", sessionId],
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [sessionId, queryClient]);

  /** Wider context so Search / Jump land with readable surroundings. */
  const CONTEXT_BEFORE = 400;
  const CONTEXT_AFTER = 400;

  const windowQuery = useQuery({
    queryKey: ["kubernetes", "logs", "window", sessionId, seekLine, windowStart],
    enabled: sessionId !== null,
    queryFn: async () => {
      if (sessionId === null) {
        throw new Error("no log session");
      }
      const session = await kubernetesApi.getLogSession(sessionId);
      if (seekLine !== null && seekLine > 0) {
        const offset = Math.max(0, seekLine - 1 - CONTEXT_BEFORE);
        const limit = Math.min(WINDOW_LIMIT, CONTEXT_BEFORE + CONTEXT_AFTER + 1);
        return kubernetesApi.readLogWindow({ sessionId, offset, limit });
      }
      if (windowStart !== null) {
        const offset = Math.max(0, Math.min(windowStart, Math.max(0, session.totalLines - 1)));
        return kubernetesApi.readLogWindow({
          sessionId,
          offset,
          limit: WINDOW_LIMIT,
        });
      }
      const offset = Math.max(0, session.totalLines - WINDOW_LIMIT);
      return kubernetesApi.readLogWindow({ sessionId, offset, limit: WINDOW_LIMIT });
    },
    // Only auto-poll when pinned to live tail (not seek / not history window).
    refetchInterval:
      sessionId !== null && seekLine === null && windowStart === null ? 1_500 : false,
  });

  const seekToLine = (lineNumber: number) => {
    if (lineNumber <= 0) {
      setSeekLine(null);
      setWindowStart(null);
      void queryClient.invalidateQueries({
        queryKey: ["kubernetes", "logs", "window", sessionId],
      });
      return;
    }
    setWindowStart(null);
    setSeekLine(lineNumber);
  };

  const loadOlder = useCallback(() => {
    const offset = windowQuery.data?.offset ?? 0;
    if (offset <= 0) return;
    const nextStart = Math.max(0, offset - Math.floor(WINDOW_LIMIT * 0.8));
    setSeekLine(null);
    setWindowStart(nextStart);
  }, [windowQuery.data?.offset]);

  const pinLiveTail = useCallback(() => {
    setSeekLine(null);
    setWindowStart(null);
    void queryClient.invalidateQueries({
      queryKey: ["kubernetes", "logs", "window", sessionId],
    });
  }, [queryClient, sessionId]);

  const jumpToTime = useCallback(
    async (target: string): Promise<number | null> => {
      if (sessionId === null) return null;
      const result = await kubernetesApi.findLogLineAtTime({ sessionId, target });
      return result.found ? result.lineNumber : null;
    },
    [sessionId],
  );

  const reconnect = useCallback(() => {
    const current = windowQuery.data;
    if (current?.lines.length) {
      setStaleLines(current.lines);
      setStaleTotal(current.totalLines);
    }
    setSeekLine(null);
    setWindowStart(null);
    setStreamStatus("following");
    setReconnectKey((k) => k + 1);
  }, [windowQuery.data]);

  const sourceLabel = activePod
    ? `${activePod.namespace}/${activePod.name}/${container || activePod.containers[0] || "app"}${previous ? " · previous" : ""}`
    : undefined;

  const displayLines = windowQuery.data?.lines ?? staleLines;
  const displayTotal = windowQuery.data?.totalLines ?? staleTotal;

  useEffect(() => {
    if (windowQuery.data?.lines.length) {
      setStaleLines(windowQuery.data.lines);
      setStaleTotal(windowQuery.data.totalLines);
    }
  }, [windowQuery.data]);

  const emptyClass = cn(
    "flex h-full min-h-0 items-center justify-center p-3 text-[12px]",
    embedded
      ? "rounded-[10px] border border-border-subtle bg-white text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      : "text-muted-foreground",
  );

  const switchWorkload = (uid: string) => {
    setSelectedResourceId(uid);
    selectDeployment(uid);
  };

  const showWorkloadPicker =
    allowServiceSwitch && kind === "deployment" && deployments.length > 0;
  const showPodPicker = allowPodSwitch && resolved.pods.length > 0;
  const showContainerPicker =
    (allowPodSwitch || allowServiceSwitch) && (activePod?.containers.length ?? 0) > 1;
  const lockedLabel =
    !allowServiceSwitch && !allowPodSwitch
      ? (activePod?.name ?? resolved.resourceName ?? null)
      : null;

  const picker = (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {showWorkloadPicker ? (
        <CompactSelect
          value={selectedId ?? ""}
          onChange={(e) => switchWorkload(e.target.value)}
          title="服务 / Deployment"
          triggerClassName={density === "dock" ? "max-w-[140px]" : "max-w-[220px]"}
        >
          {deployments.map((d) => (
            <option key={d.uid} value={d.uid}>
              {d.name}
            </option>
          ))}
        </CompactSelect>
      ) : null}
      {showPodPicker ? (
        <CompactSelect
          value={activePod?.uid ?? ""}
          onChange={(e) => pickPod(e.target.value)}
          title={t("explorer.logPod")}
          triggerClassName="max-w-[260px]"
        >
          {resolved.pods.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.name}
            </option>
          ))}
        </CompactSelect>
      ) : null}
      {showContainerPicker ? (
        <CompactSelect
          value={container}
          onChange={(e) => setContainer(e.target.value)}
          title={t("explorer.logContainer")}
          triggerClassName="max-w-[100px]"
        >
          {activePod?.containers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </CompactSelect>
      ) : null}
      {lockedLabel ? (
        <span
          className="max-w-[240px] truncate font-mono text-[11px] text-muted-foreground"
          title={lockedLabel}
        >
          {lockedLabel}
        </span>
      ) : null}
      <CompactSelect
        value={previous ? "previous" : "current"}
        onChange={(e) => setPrevious(e.target.value === "previous")}
        title="Lifecycle"
        triggerClassName="w-[96px]"
      >
        <option value="current">Current</option>
        <option value="previous">Previous</option>
      </CompactSelect>
      <CompactSelect
        value={String(sinceSeconds)}
        onChange={(e) => setSinceSeconds(Number(e.target.value))}
        title="打开时从集群拉取的时间范围（换源会重开 session）"
        triggerClassName="w-[100px]"
      >
        <option value="0">Since: 不限</option>
        <option value="300">近 5m</option>
        <option value="1800">近 30m</option>
        <option value="3600">近 1h</option>
        <option value="21600">近 6h</option>
      </CompactSelect>
      {sinceSeconds === 0 ? (
        <CompactSelect
          value={String(tailLines)}
          onChange={(e) => setTailLines(Number(e.target.value))}
          title="打开时从集群拉取的历史行数（不是视口限制）"
          triggerClassName="w-[110px]"
        >
          <option value="100">拉取 Tail 100</option>
          <option value="1000">拉取 Tail 1k</option>
          <option value="5000">拉取 Tail 5k</option>
          <option value="0">拉取全部历史</option>
        </CompactSelect>
      ) : null}
    </div>
  );

  if (clusterId === null) {
    return <div className={emptyClass}>{t("workspace.selectCluster")}</div>;
  }

  if (selectedId === null && deployments.length === 0) {
    return <div className={emptyClass}>{t("explorer.selectPodForLogs")}</div>;
  }

  if (podsQuery.isLoading && resolved.pods.length === 0) {
    return <div className={emptyClass}>{t("workspace.loading")}</div>;
  }

  const windowOffset = windowQuery.data?.offset ?? 0;
  const pinnedToTail = seekLine === null && windowStart === null;
  const statusHint =
    streamStatus === "error"
      ? `断流 · 磁盘 ${displayTotal} 行（清空不删盘）`
      : displayTotal > 0
        ? pinnedToTail
          ? `实时 · 磁盘 ${displayTotal} 行 · 读窗末 ${displayLines.length}`
          : `浏览历史 · 磁盘 ${displayTotal} 行 · 偏移 ${windowOffset}`
        : "实时 · 落本地磁盘";

  const viewerExtras = {
    sessionId,
    onSeekToLine: seekToLine,
    streamStatus,
    onReconnect: reconnect,
    totalLines: displayTotal,
    onJumpToTime: jumpToTime,
    canLoadOlder: windowOffset > 0,
    onLoadOlder: loadOlder,
    onPinLiveTail: pinLiveTail,
    historyBrowsing: !pinnedToTail,
    ...(sourceLabel ? { sourceLabel } : {}),
  };

  // Empty / error / loading still show header chrome when embedded so user can switch service
  if (
    embedded &&
    resolved.pods.length === 0
  ) {
    return (
      <LogViewer
        variant="terminal"
        lines={[]}
        toolbarStart={picker || undefined}
        defaultCollapsed={defaultCollapsed}
        enableFullscreen={enableFullscreen}
        enableCollapse={enableCollapse}
        density={density}
        statusHint={statusHint}
        {...viewerExtras}
        {...(expandedClassName ? { expandedClassName } : {})}
      />
    );
  }

  if (
    embedded &&
    openError &&
    displayLines.length === 0
  ) {
    return (
      <LogViewer
        variant="terminal"
        lines={[]}
        toolbarStart={picker || undefined}
        defaultCollapsed={defaultCollapsed}
        enableFullscreen={enableFullscreen}
        enableCollapse={enableCollapse}
        density={density}
        statusHint={openError}
        {...viewerExtras}
        {...(expandedClassName ? { expandedClassName } : {})}
      />
    );
  }

  if (!embedded) {
    if (openError && displayLines.length === 0) {
      return <div className={cn(emptyClass, "text-destructive")}>{openError}</div>;
    }
    if (windowQuery.isError && displayLines.length === 0) {
      return (
        <div className={cn(emptyClass, "text-destructive")}>
          {windowQuery.error instanceof Error ? windowQuery.error.message : "log window failed"}
        </div>
      );
    }
    if (!windowQuery.data && displayLines.length === 0) {
      return (
        <div className={emptyClass}>
          {t("explorer.openingLogs")}
          {activePod ? ` · ${activePod.name}` : ""}
        </div>
      );
    }
    if (resolved.pods.length === 0) {
      return (
        <div className={emptyClass}>
          {t("explorer.noBackingPods")}
          {resolved.resourceName ? ` (${kind}/${resolved.resourceName})` : ""}
        </div>
      );
    }
  }

  if (embedded) {
    return (
      <LogViewer
        variant="terminal"
        lines={displayLines}
        toolbarStart={picker || undefined}
        defaultCollapsed={defaultCollapsed}
        enableFullscreen={enableFullscreen}
        enableCollapse={enableCollapse}
        density={density}
        statusHint={statusHint}
        {...viewerExtras}
        {...(expandedClassName ? { expandedClassName } : {})}
        {...(sessionId !== null
          ? {
              onPausedChange: (paused: boolean) => {
                void kubernetesApi.pauseLogs(sessionId, paused);
              },
            }
          : {})}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {picker ? (
        <div className="w-full border-b border-border-subtle px-2 py-1.5">{picker}</div>
      ) : null}
      <div className="min-h-0 flex-1">
        <LogViewer
          lines={displayLines}
          {...viewerExtras}
          {...(sessionId !== null
            ? {
                onPausedChange: (paused: boolean) => {
                  void kubernetesApi.pauseLogs(sessionId, paused);
                },
              }
            : {})}
        />
      </div>
    </div>
  );
}
