import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { kubernetesPodExecApi } from "@/capabilities/kubernetes/api/exec";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import {
  useDeployments,
  usePods,
  useServices,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { resolveLogTarget } from "@/capabilities/kubernetes/logs/resolve-log-target";
import "@xterm/xterm/css/xterm.css";

const OUTPUT_EVENT = "k8s-exec-output";
const CLOSED_EVENT = "k8s-exec-closed";

interface ExecOutputPayload {
  sessionId: string;
  data: string;
}

interface ExecClosedPayload {
  sessionId: string;
  reason: string;
}

/**
 * Pod Exec pane — resolves Service/Deployment to a backing Pod first.
 */
export function PodExecPane({
  embedded = false,
}: {
  /** Dashboard console: white title bar + nested dark terminal. */
  embedded?: boolean;
} = {}) {
  const { t } = useTranslation();
  const cluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  const kind = useKubernetesWorkspaceStore((s) => s.resourceListKind);

  const podsQuery = usePods(clusterId, namespace, { enabled: clusterId !== null });
  const deploymentsQuery = useDeployments(clusterId, namespace, {
    enabled: clusterId !== null && kind === "deployment",
  });
  const servicesQuery = useServices(clusterId, namespace, {
    enabled: clusterId !== null && kind === "service",
  });

  const resolved = useMemo(
    () =>
      resolveLogTarget({
        kind,
        selectedId,
        pods: podsQuery.data ?? [],
        deployments: deploymentsQuery.data ?? [],
        services: servicesQuery.data ?? [],
      }),
    [deploymentsQuery.data, kind, podsQuery.data, selectedId, servicesQuery.data],
  );

  const [execPodUid, setExecPodUid] = useState<string | null>(null);
  useEffect(() => {
    setExecPodUid(resolved.preferred?.uid ?? null);
  }, [resolved.preferred?.uid, selectedId, kind]);

  const selectedPod =
    resolved.pods.find((p) => p.uid === execPodUid) ?? resolved.preferred ?? null;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "blocked" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canExec = cluster !== null && !cluster.readonly;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      theme: {
        background: "#0b0f14",
        foreground: "#e6edf3",
        cursor: "#e6edf3",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    term.writeln("\x1b[90mSelect a Pod (or Service/Deployment) to exec /bin/sh\x1b[0m");

    const onResize = () => {
      fit.fit();
      const sid = sessionRef.current;
      if (sid) {
        void kubernetesPodExecApi.resize(sid, term.cols, term.rows).catch(() => undefined);
      }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    const dataDisp = term.onData((data) => {
      const sid = sessionRef.current;
      if (!sid) {
        return;
      }
      void kubernetesPodExecApi.write(sid, data).catch(() => undefined);
    });

    let unlistenOut: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    void listen<ExecOutputPayload>(OUTPUT_EVENT, (event) => {
      if (event.payload.sessionId !== sessionRef.current) {
        return;
      }
      term.write(event.payload.data);
    }).then((fn) => {
      unlistenOut = fn;
    });
    void listen<ExecClosedPayload>(CLOSED_EVENT, (event) => {
      if (event.payload.sessionId !== sessionRef.current) {
        return;
      }
      sessionRef.current = null;
      setStatus("error");
      setErrorMessage(`Disconnected (${event.payload.reason})`);
      term.writeln(`\r\n\x1b[33mDisconnected (${event.payload.reason})\x1b[0m`);
    }).then((fn) => {
      unlistenClose = fn;
    });

    return () => {
      dataDisp.dispose();
      ro.disconnect();
      unlistenOut?.();
      unlistenClose?.();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) {
      return;
    }

    let cancelled = false;
    let openedId: string | null = null;

    const closePrev = async (id: string | null) => {
      if (!id) {
        return;
      }
      await kubernetesPodExecApi.close(id).catch(() => undefined);
    };

    void (async () => {
      const prev = sessionRef.current;
      sessionRef.current = null;
      await closePrev(prev);

      if (clusterId === null || selectedPod === null) {
        if (!cancelled) {
          setStatus("idle");
          setErrorMessage(null);
          term.reset();
          if (selectedId !== null && resolved.pods.length === 0) {
            term.writeln(`\x1b[33m${t("explorer.noBackingPods")}\x1b[0m`);
          } else {
            term.writeln(
              "\x1b[90mSelect a Pod (or Service/Deployment) to exec /bin/sh\x1b[0m",
            );
          }
        }
        return;
      }

      if (!canExec) {
        if (!cancelled) {
          setStatus("blocked");
          const reason = cluster?.readonly
            ? "Cluster is readonly — reconnect without readonly to exec"
            : "Exec blocked";
          setErrorMessage(reason);
          term.reset();
          term.writeln(`\x1b[33m${reason}\x1b[0m`);
        }
        return;
      }

      if (!cancelled) {
        setStatus("connecting");
        setErrorMessage(null);
        term.reset();
        term.writeln(`\x1b[90mConnecting to ${selectedPod.name}…\x1b[0m`);
      }

      fitRef.current?.fit();
      try {
        const session = await kubernetesPodExecApi.open({
          clusterId,
          namespace: selectedPod.namespace,
          pod: selectedPod.name,
          cols: term.cols,
          rows: term.rows,
        });
        if (cancelled) {
          await closePrev(session.sessionId);
          return;
        }
        openedId = session.sessionId;
        sessionRef.current = session.sessionId;
        term.reset();
        setStatus("open");
        term.writeln(`\x1b[90mConnected · ${selectedPod.namespace}/${selectedPod.name}\x1b[0m\r\n`);
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "exec open failed";
        setStatus("error");
        setErrorMessage(message);
        term.writeln(`\x1b[31m${message}\x1b[0m`);
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current = null;
      if (openedId !== null) {
        void kubernetesPodExecApi.close(openedId).catch(() => undefined);
      }
    };
  }, [
    clusterId,
    selectedPod?.namespace,
    selectedPod?.name,
    canExec,
    cluster?.readonly,
    selectedId,
    resolved.pods.length,
    t,
  ]);

  const showPodPicker = kind !== "pod" && resolved.pods.length > 1;

  const pickerSelect = showPodPicker ? (
    <select
      className={
        embedded
          ? "h-7 max-w-[200px] rounded-[6px] border border-border-subtle bg-white px-1.5 font-mono text-[11px]"
          : "h-7 max-w-[200px] rounded-[6px] border border-input bg-background px-1.5 font-mono text-[11px]"
      }
      value={selectedPod?.uid ?? ""}
      onChange={(e) => setExecPodUid(e.target.value)}
    >
      {resolved.pods.map((p) => (
        <option key={p.uid} value={p.uid}>
          {p.name} ({p.phase})
        </option>
      ))}
    </select>
  ) : (
    <span
      className={
        embedded
          ? "max-w-[180px] truncate font-mono text-[11px] text-muted-foreground"
          : "font-mono text-muted-foreground"
      }
      title={selectedPod ? `${selectedPod.namespace}/${selectedPod.name}` : undefined}
    >
      {selectedPod ? selectedPod.name : "—"}
    </span>
  );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-border-subtle bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          <span className="shrink-0 text-[13px] font-semibold">终端</span>
          {pickerSelect}
          <span className="ml-auto truncate text-[11px] text-muted-foreground">{status}</span>
        </div>
        {errorMessage && status !== "open" ? (
          <p className="border-b border-border-subtle px-3 py-1 text-[11px] text-destructive">
            {errorMessage}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 p-3">
          <div
            ref={hostRef}
            className="h-full min-h-0 overflow-hidden rounded-[8px] bg-[#0b0f14] p-1"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-[12px]">
        <span className="font-medium">Pod Exec</span>
        {pickerSelect}
        <span className="ml-auto text-muted-foreground">{status}</span>
      </div>
      {errorMessage && status !== "open" ? (
        <p className="border-b border-border-subtle px-3 py-1 text-[12px] text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <div ref={hostRef} className="min-h-0 flex-1 p-1" />
    </div>
  );
}
