import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Sliding Read Window sizes (docs/logs/read-window.md). Not "max logs forever". */
const READ_WINDOW_SIZES = [2_000, 5_000, 10_000, 20_000] as const;
type ReadWindowSize = (typeof READ_WINDOW_SIZES)[number];
const DEFAULT_READ_WINDOW: ReadWindowSize = 5_000;
/** Keep this fraction of the old window when sliding (overlap). */
const SLIDE_KEEP_RATIO = 0.25;
/** Debounce UI close → detach so StrictMode / quick remount can re-attach. */
const CLOSE_DEBOUNCE_MS = 350;
const MANAGED_LOG_APPENDED_EVENT = "managed-log-appended";

interface ManagedLogAppendedPayload {
  sessionId: string;
  totalLines: number;
  status: string;
}

/** Homepage idle: fake terminal + CTA; no Since/Tail chrome, no kube pull. */
function IdleLogsCard({
  subtitle,
  hint,
  canOpen,
  className,
  onOpen,
}: {
  subtitle?: string;
  hint?: string;
  canOpen: boolean;
  className?: string;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-border-subtle bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className ?? "h-full",
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <span className="shrink-0 text-[13px] font-semibold text-foreground">实时日志</span>
        {subtitle ? (
          <span
            className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
            title={subtitle}
          >
            {subtitle}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">未拉取</span>
      </div>
      <div className="relative min-h-0 flex-1 p-3">
        <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-3 rounded-[8px] bg-[#0b0f14] px-4">
          <p className="max-w-[280px] text-center text-[12px] leading-5 text-[#64748b]">
            {hint ?? "选择资源后展开查看；打开前不占用集群日志流"}
          </p>
          <button
            type="button"
            disabled={!canOpen}
            onClick={onOpen}
            className={cn(
              "rounded-[8px] px-4 py-1.5 text-[13px] font-medium transition-colors",
              canOpen
                ? "bg-[#e2e8f0] text-[#0b0f14] hover:bg-white"
                : "cursor-not-allowed bg-[#1e293b] text-[#475569]",
            )}
          >
            打开日志
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Live Logs: kubernetesApi → Disk-as-Source.
 * Pod / Service / Deployment → resolve backing Pod (+ optional container).
 */
export function KubernetesLogsPane({
  embedded = false,
  defaultCollapsed = false,
  openWhenExpanded = false,
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
  /**
   * Only open kube follow while the viewer is expanded.
   * Homepage browsing: collapse by default → no pull until user expands.
   */
  openWhenExpanded?: boolean;
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
  /** 0-based Read Window start; null = pin to live tail (Follow). */
  const [windowStart, setWindowStart] = useState<number | null>(null);
  const [readWindowSize, setReadWindowSize] = useState<ReadWindowSize>(DEFAULT_READ_WINDOW);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  /** Keep last window while reconnecting (do not flash empty). */
  const [staleLines, setStaleLines] = useState<LogLine[]>([]);
  const [staleTotal, setStaleTotal] = useState(0);
  /** sessionId → pending close timer (Grace Period friendly remount). */
  const pendingCloseRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [viewerCollapsed, setViewerCollapsed] = useState(defaultCollapsed);
  const [historyMasked, setHistoryMasked] = useState(false);
  const shouldStream = !openWhenExpanded || !viewerCollapsed;

  useEffect(() => {
    if (!shouldStream || clusterId === null || activePod === null) {
      setSessionId(null);
      setOpenError(null);
      setStreamStatus(null);
      if (clusterId === null || activePod === null) {
        setStaleLines([]);
        setStaleTotal(0);
      }
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
        const pending = pendingCloseRef.current.get(opened.sessionId);
        if (pending !== undefined) {
          clearTimeout(pending);
          pendingCloseRef.current.delete(opened.sessionId);
        }
        if (cancelled) {
          void kubernetesApi.closeLogs(opened.sessionId);
          return;
        }
        setSessionId(opened.sessionId);
        setHistoryMasked(false);
        if (!opened.fromCache) {
          setWindowStart(null);
        }
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
        const id = openedId;
        const existing = pendingCloseRef.current.get(id);
        if (existing !== undefined) {
          clearTimeout(existing);
        }
        pendingCloseRef.current.set(
          id,
          setTimeout(() => {
            pendingCloseRef.current.delete(id);
            void kubernetesApi.closeLogs(id);
          }, CLOSE_DEBOUNCE_MS),
        );
      }
    };
  }, [
    shouldStream,
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

  const clampWindowStart = useCallback(
    (start: number, total: number, size: number) => {
      const maxStart = Math.max(0, total - size);
      return Math.max(0, Math.min(start, maxStart));
    },
    [],
  );

  const windowQuery = useQuery({
    queryKey: ["kubernetes", "logs", "window", sessionId, windowStart, readWindowSize],
    enabled: sessionId !== null,
    queryFn: async () => {
      if (sessionId === null) {
        throw new Error("no log session");
      }
      const session = await kubernetesApi.getLogSession(sessionId);
      const size = readWindowSize;
      const total = session.totalLines;
      if (windowStart !== null) {
        const offset = clampWindowStart(windowStart, total, size);
        return kubernetesApi.readLogWindow({ sessionId, offset, limit: size });
      }
      const offset = Math.max(0, total - size);
      return kubernetesApi.readLogWindow({ sessionId, offset, limit: size });
    },
    // Batch refresh while pinned to live tail (~滑动窗口贴尾).
    refetchInterval: sessionId !== null && windowStart === null ? 200 : false,
  });

  const pinLiveTail = useCallback(() => {
    setWindowStart(null);
    void queryClient.invalidateQueries({
      queryKey: ["kubernetes", "logs", "window", sessionId],
    });
  }, [queryClient, sessionId]);

  /**
   * Leave Follow: freeze Read Window at current offset so we stop chasing the tail.
   * Without this, 200ms refetch keeps resetting to "latest N lines" and sliding never sticks.
   */
  const freezeReadWindow = useCallback(() => {
    setWindowStart((prev) => {
      if (prev !== null) return prev;
      const total = windowQuery.data?.totalLines ?? staleTotal;
      const offset = windowQuery.data?.offset ?? Math.max(0, total - readWindowSize);
      return clampWindowStart(offset, total, readWindowSize);
    });
  }, [
    windowQuery.data?.offset,
    windowQuery.data?.totalLines,
    staleTotal,
    readWindowSize,
    clampWindowStart,
  ]);

  /** Center sliding window on 1-based line (Search / Jump). */
  const seekToLine = useCallback(
    (lineNumber: number) => {
      if (lineNumber <= 0) {
        pinLiveTail();
        return;
      }
      const total = windowQuery.data?.totalLines ?? staleTotal;
      const size = readWindowSize;
      const start = clampWindowStart(lineNumber - 1 - Math.floor(size / 2), total, size);
      setWindowStart(start);
    },
    [windowQuery.data?.totalLines, staleTotal, readWindowSize, clampWindowStart, pinLiveTail],
  );

  /** Slide toward older lines; size stays ~readWindowSize. */
  const slideOlder = useCallback(() => {
    const total = windowQuery.data?.totalLines ?? staleTotal;
    const offset =
      windowStart !== null
        ? windowStart
        : (windowQuery.data?.offset ?? Math.max(0, total - readWindowSize));
    if (offset <= 0) return;
    const step = Math.max(1, Math.floor(readWindowSize * (1 - SLIDE_KEEP_RATIO)));
    const next = clampWindowStart(offset - step, total, readWindowSize);
    if (next === offset && offset > 0) {
      setWindowStart(0);
      return;
    }
    setWindowStart(next);
  }, [
    windowStart,
    windowQuery.data?.offset,
    windowQuery.data?.totalLines,
    staleTotal,
    readWindowSize,
    clampWindowStart,
  ]);

  /** Slide toward newer lines; at end → pin live tail. */
  const slideNewer = useCallback(() => {
    const offset = windowQuery.data?.offset ?? 0;
    const total = windowQuery.data?.totalLines ?? 0;
    const step = Math.floor(readWindowSize * (1 - SLIDE_KEEP_RATIO));
    const maxStart = Math.max(0, total - readWindowSize);
    const next = offset + step;
    if (next >= maxStart) {
      pinLiveTail();
      return;
    }
    setWindowStart(next);
  }, [
    windowQuery.data?.offset,
    windowQuery.data?.totalLines,
    readWindowSize,
    pinLiveTail,
  ]);

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
    setWindowStart(null);
    setStreamStatus("following");
    setReconnectKey((k) => k + 1);
  }, [windowQuery.data]);

  const sourceLabel = activePod
    ? `${activePod.namespace}/${activePod.name}/${container || activePod.containers[0] || "app"}${previous ? " · previous" : ""}`
    : undefined;

  const aiContextMeta = {
    ...(clusterId ? { clusterId } : {}),
    ...(activePod
      ? {
          namespace: activePod.namespace,
          pod: activePod.name,
          container: container || activePod.containers[0] || "app",
        }
      : {}),
    previous,
    ...(sinceSeconds > 0 ? { sinceSeconds } : {}),
    ...(sinceSeconds === 0 ? { tailLines } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
  };

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

  /** Pod / container only — safe on narrow homepage header. */
  const pickerTarget =
    showWorkloadPicker || showPodPicker || showContainerPicker || lockedLabel ? (
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {showWorkloadPicker ? (
          <CompactSelect
            value={selectedId ?? ""}
            onChange={(e) => switchWorkload(e.target.value)}
            title="服务 / Deployment"
            triggerClassName={density === "dock" ? "max-w-[120px]" : "max-w-[160px]"}
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
            triggerClassName="max-w-[180px]"
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
            triggerClassName="max-w-[88px]"
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
            className="max-w-[160px] truncate font-mono text-[11px] text-muted-foreground"
            title={lockedLabel}
          >
            {lockedLabel}
          </span>
        ) : null}
      </div>
    ) : null;

  /** Current / Since / Tail — homepage: only in fullscreen. */
  const pickerSource = (
    <div className="flex min-w-0 items-center gap-1.5">
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
        title="变更拉取参数将重新拉取历史并重置会话"
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
          title="变更拉取参数将重新拉取历史并重置会话（不是阅读窗口大小）"
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

  const picker = (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {pickerTarget}
      {pickerSource}
    </div>
  );

  const compactToolbar = Boolean(openWhenExpanded);

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
  const pinnedToTail = windowStart === null;
  const canSlideOlder = windowOffset > 0;
  const canSlideNewer =
    !pinnedToTail &&
    displayTotal > 0 &&
    windowOffset + displayLines.length < displayTotal;
  const statusHint =
    streamStatus === "error"
      ? "断流 · 本地缓存仍保留"
      : streamStatus === "suspended"
        ? "已挂起"
        : historyMasked
          ? `● 实时跟随 | 视口已隐藏历史 (本地已缓存 ${displayTotal.toLocaleString()} 行)`
          : displayTotal > 0
            ? pinnedToTail
              ? `● 实时跟随 | 本地已缓存 ${displayTotal.toLocaleString()} 行 (渲染最新 ${displayLines.length} 行)`
              : `⏸ 已暂停跟随 | 查看历史第 ${(windowOffset + 1).toLocaleString()} ~ ${(windowOffset + displayLines.length).toLocaleString()} 行 / 共 ${displayTotal.toLocaleString()} 行`
            : "● 实时跟随 | 正在写入本地缓存…";

  const idleSubtitle = activePod
    ? `${activePod.name}${container ? ` / ${container}` : ""}`
    : resolved.resourceName
      ? `${kind}/${resolved.resourceName}`
      : undefined;

  if (embedded && openWhenExpanded && viewerCollapsed) {
    const noPod = resolved.pods.length === 0;
    return (
      <IdleLogsCard
        {...(idleSubtitle ? { subtitle: idleSubtitle } : {})}
        hint={
          noPod
            ? "当前资源没有可跟随的 Pod"
            : "尚未拉取 · 打开后可调 Since / Tail 并实时跟随"
        }
        canOpen={!noPod && activePod !== null}
        onOpen={() => setViewerCollapsed(false)}
        {...(expandedClassName ? { className: expandedClassName } : {})}
      />
    );
  }

  const viewerExtras = {
    sessionId,
    onSeekToLine: seekToLine,
    streamStatus,
    onReconnect: reconnect,
    totalLines: displayTotal,
    onJumpToTime: jumpToTime,
    onCollapsedChange: setViewerCollapsed,
    onViewportMaskChange: setHistoryMasked,
    compactToolbar,
    readWindowSize,
    onReadWindowSizeChange: (n: number) => {
      if ((READ_WINDOW_SIZES as readonly number[]).includes(n)) {
        setReadWindowSize(n as ReadWindowSize);
      }
    },
    windowOffset,
    canSlideOlder,
    canSlideNewer,
    onSlideOlder: slideOlder,
    onSlideNewer: slideNewer,
    onFreezeReadWindow: freezeReadWindow,
    onPinLiveTail: pinLiveTail,
    historyBrowsing: !pinnedToTail,
    ...(sourceLabel ? { sourceLabel } : {}),
    aiContextMeta,
  };

  const embeddedToolbar = compactToolbar
    ? {
        ...(pickerTarget ? { toolbarStart: pickerTarget } : {}),
        toolbarSecondary: pickerSource,
      }
    : {
        ...(picker ? { toolbarStart: picker } : {}),
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
        {...embeddedToolbar}
        defaultCollapsed={false}
        enableFullscreen={enableFullscreen}
        enableCollapse={openWhenExpanded ? true : enableCollapse}
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
        {...embeddedToolbar}
        defaultCollapsed={false}
        enableFullscreen={enableFullscreen}
        enableCollapse={openWhenExpanded ? true : enableCollapse}
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
        {...embeddedToolbar}
        defaultCollapsed={false}
        enableFullscreen={enableFullscreen}
        enableCollapse={openWhenExpanded ? true : enableCollapse}
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
