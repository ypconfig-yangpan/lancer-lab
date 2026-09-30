import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, InspectorSection } from "@lancer/ui";
import { cn } from "@/shared/lib/utils";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";
import { dockerApi } from "../api/client";
import type { DockerContainerRow } from "../helpers/mock-data";

type ActionKind = "start" | "stop" | "restart" | "remove" | null;

const ACTION_META: Record<
  Exclude<ActionKind, null>,
  { title: string; danger: boolean; hint: string; force?: boolean }
> = {
  start: {
    title: "Start",
    danger: false,
    hint: "Start this container.",
  },
  stop: {
    title: "Stop",
    danger: true,
    hint: "Stop sends SIGTERM then SIGKILL after timeout.",
  },
  restart: {
    title: "Restart",
    danger: true,
    hint: "Restart the container (brief downtime).",
  },
  remove: {
    title: "Remove",
    danger: true,
    hint: "Force-remove the container from the Engine.",
    force: true,
  },
};

/**
 * Product Quick Actions: Start / Stop / Restart / Open Terminal via dockerApi.
 */
export function DockerContainerWriteActions({ row }: { row: DockerContainerRow }) {
  const queryClient = useQueryClient();
  const setActiveBottomViewId = useWorkspaceStore((s) => s.setActiveBottomViewId);
  const [confirm, setConfirm] = useState<ActionKind>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);

  const status = String(row.status ?? "");
  const running = /running/i.test(status);
  const containerId = String(row.id ?? "");
  const name = String(row.name ?? containerId.slice(0, 12));

  const run = async (kind: Exclude<ActionKind, null>) => {
    const meta = ACTION_META[kind];
    setBusy(true);
    setError(null);
    setLastOk(null);
    try {
      if (kind === "start") {
        await dockerApi.startContainer(containerId);
      } else if (kind === "stop") {
        await dockerApi.stopContainer(containerId);
      } else if (kind === "restart") {
        await dockerApi.restartContainer(containerId);
      } else {
        await dockerApi.removeContainer(containerId, { force: true });
      }
      setLastOk(`${meta.title} ok · ${name}`);
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: ["docker"] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InspectorSection title="Actions">
      <div className="flex flex-col gap-2 text-[13px]">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setActiveBottomViewId("docker.logs")}
          >
            Logs
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !running}
            onClick={() => setActiveBottomViewId("docker.terminal")}
          >
            Terminal
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || running || !containerId}
            onClick={() => {
              setError(null);
              setLastOk(null);
              setConfirm("start");
            }}
          >
            Start
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !running || !containerId}
            onClick={() => {
              setError(null);
              setLastOk(null);
              setConfirm("stop");
            }}
          >
            Stop
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !containerId}
            onClick={() => {
              setError(null);
              setLastOk(null);
              setConfirm("restart");
            }}
          >
            Restart
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy || !containerId}
            onClick={() => {
              setError(null);
              setLastOk(null);
              setConfirm("remove");
            }}
          >
            Remove
          </Button>
        </div>

        {confirm ? (
          <div
            className={cn(
              "rounded-[8px] border border-border-subtle bg-surface-1 p-3",
              ACTION_META[confirm].danger && "border-destructive/40",
            )}
          >
            <p className="mb-2 font-medium">Confirm {ACTION_META[confirm].title}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-muted-foreground">Container</dt>
              <dd className="font-mono">{name}</dd>
              <dt className="text-muted-foreground">Id</dt>
              <dd className="font-mono">{containerId.slice(0, 12)}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{status || "—"}</dd>
            </dl>
            <p className="mt-2 text-[12px] text-muted-foreground">{ACTION_META[confirm].hint}</p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant={ACTION_META[confirm].danger ? "danger" : "default"}
                disabled={busy}
                onClick={() => void run(confirm)}
              >
                {busy ? "Working…" : "Confirm"}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        {lastOk ? <p className="text-[12px] text-muted-foreground">{lastOk}</p> : null}
      </div>
    </InspectorSection>
  );
}
