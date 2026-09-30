import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    if (clusterId === null || activePod === null) {
      setSessionId(null);
      setOpenError(null);
      return;
    }

    let cancelled = false;
    let openedId: string | null = null;
    void (async () => {
      try {
        setOpenError(null);
        const opened = await kubernetesApi.openLogs({
          connectionId: clusterId,
          namespace: activePod.namespace,
          pod: activePod.name,
          follow: true,
          ...(container ? { container } : {}),
        });
        openedId = opened.sessionId;
        if (cancelled) {
          await kubernetesApi.closeLogs(opened.sessionId);
          return;
        }
        setSessionId(opened.sessionId);
      } catch (err: unknown) {
        if (!cancelled) {
          setSessionId(null);
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
  }, [clusterId, activePod?.namespace, activePod?.name, container]);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    let unlisten: (() => void) | undefined;
    void listen<ManagedLogAppendedPayload>(MANAGED_LOG_APPENDED_EVENT, (event) => {
      if (event.payload.sessionId !== sessionId) {
        return;
      }
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

  const windowQuery = useQuery({
    queryKey: ["kubernetes", "logs", "window", sessionId],
    enabled: sessionId !== null,
    queryFn: async () => {
      if (sessionId === null) {
        throw new Error("no log session");
      }
      const session = await kubernetesApi.getLogSession(sessionId);
      const offset = Math.max(0, session.totalLines - WINDOW_LIMIT);
      return kubernetesApi.readLogWindow({ sessionId, offset, limit: WINDOW_LIMIT });
    },
    refetchInterval: sessionId !== null ? 1_500 : false,
  });

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

  const picker = (showWorkloadPicker || showPodPicker || showContainerPicker || lockedLabel) && (
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

  const statusHint = windowQuery.data
    ? `集群实时 · 本地已缓存 ${windowQuery.data.totalLines} 行`
    : "集群实时 · 落本地缓存";

  // Empty / error / loading still show header chrome when embedded so user can switch service
  if (
    embedded &&
    (openError || windowQuery.isError || !windowQuery.data || resolved.pods.length === 0)
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
        {...(expandedClassName ? { expandedClassName } : {})}
      />
    );
  }

  if (!embedded) {
    if (openError) {
      return <div className={cn(emptyClass, "text-destructive")}>{openError}</div>;
    }
    if (windowQuery.isError) {
      return (
        <div className={cn(emptyClass, "text-destructive")}>
          {windowQuery.error instanceof Error ? windowQuery.error.message : "log window failed"}
        </div>
      );
    }
    if (!windowQuery.data) {
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
        lines={windowQuery.data?.lines ?? []}
        toolbarStart={picker || undefined}
        defaultCollapsed={defaultCollapsed}
        enableFullscreen={enableFullscreen}
        enableCollapse={enableCollapse}
        density={density}
        statusHint={statusHint}
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
          lines={windowQuery.data!.lines}
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
