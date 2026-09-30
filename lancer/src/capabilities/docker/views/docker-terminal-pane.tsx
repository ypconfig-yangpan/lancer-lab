import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { listen } from "@tauri-apps/api/event";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useModuleSelectionStore } from "@/shell/presentation";
import { dockerApi } from "../api/client";
import { execOpenWithFallback, listContainersWithFallback } from "../helpers/fallback";
import "@xterm/xterm/css/xterm.css";

const MODULE_ID = "docker";
const OUTPUT_EVENT = "docker-exec-output";
const CLOSED_EVENT = "docker-exec-closed";

interface ExecOutputPayload {
  sessionId: string;
  data: string;
}

interface ExecClosedPayload {
  sessionId: string;
  reason: string;
}

/**
 * Bottom Terminal: selected container → dockerApi.exec* → bollard TTY.
 */
export function DockerTerminalPane() {
  const { t } = useTranslation();
  const selectedRowId = useModuleSelectionStore(
    (s) => s.byModule[MODULE_ID]?.selectedRowId ?? null,
  );
  const containersQuery = useQuery({
    queryKey: ["docker", "containers", "for-exec"],
    queryFn: () => listContainersWithFallback({}),
    staleTime: 8_000,
  });
  const containerName =
    containersQuery.data?.rows.find((r) => r.id === selectedRowId)?.name ??
    (selectedRowId ? selectedRowId.slice(0, 12) : null);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "mock" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        background: "#0f1419",
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
    term.writeln("\x1b[90mSelect a container to exec /bin/sh\x1b[0m");

    const onResize = () => {
      fit.fit();
      const sid = sessionRef.current;
      if (sid && !sid.startsWith("mock-exec-")) {
        void dockerApi.execResize({ sessionId: sid, cols: term.cols, rows: term.rows });
      }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(host);

    const dataDisp = term.onData((data) => {
      const sid = sessionRef.current;
      if (!sid || sid.startsWith("mock-exec-")) {
        return;
      }
      void dockerApi.execWrite({ sessionId: sid, data });
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
      if (id.startsWith("mock-exec-")) {
        return;
      }
      try {
        await dockerApi.execClose(id);
      } catch {
        /* session may already be gone */
      }
    };

    void (async () => {
      const prev = sessionRef.current;
      sessionRef.current = null;
      await closePrev(prev);

      if (selectedRowId === null) {
        if (!cancelled) {
          setStatus("idle");
          setErrorMessage(null);
          term.reset();
          term.writeln(`\x1b[90m${t("explorer.selectContainer")} · exec /bin/sh\x1b[0m`);
        }
        return;
      }

      if (!cancelled) {
        setStatus("connecting");
        setErrorMessage(null);
        term.reset();
        term.writeln(`\x1b[90mConnecting to ${containerName ?? selectedRowId.slice(0, 12)}…\x1b[0m`);
      }

      fitRef.current?.fit();

      try {
        const data = await execOpenWithFallback({
          containerId: selectedRowId,
          cols: term.cols,
          rows: term.rows,
        });

        if (cancelled) {
          await closePrev(data.sessionId);
          return;
        }

        openedId = data.sessionId;
        sessionRef.current = data.sessionId;
        term.reset();

        if (data.source === "mock" || data.status === "mock") {
          setStatus("mock");
          term.writeln("\x1b[33mDocker Engine unavailable — mock terminal\x1b[0m");
          term.writeln(
            `\x1b[90mlancer@local ~ % docker exec -it ${selectedRowId.slice(0, 12)} /bin/sh\x1b[0m`,
          );
          term.writeln("Start OrbStack / Docker Desktop for real container exec.");
          term.writeln("");
          return;
        }

        setStatus("open");
        term.focus();
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
      const id = openedId ?? sessionRef.current;
      sessionRef.current = null;
      if (id) {
        void closePrev(id);
      }
    };
  }, [selectedRowId, containerName, t]);

  const statusLabel =
    status === "open"
      ? "connected"
      : status === "mock"
        ? "offline"
        : status === "connecting"
          ? "connecting…"
          : status === "error"
            ? (errorMessage ?? "error")
            : "idle";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-[12px]">
        <span className="font-medium">Terminal</span>
        {selectedRowId ? (
          <span className="font-mono text-muted-foreground">{containerName}</span>
        ) : (
          <span className="text-muted-foreground">exec /bin/sh</span>
        )}
        <span className="ml-auto text-muted-foreground">{statusLabel}</span>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 bg-[#0f1419] p-1" />
    </div>
  );
}
