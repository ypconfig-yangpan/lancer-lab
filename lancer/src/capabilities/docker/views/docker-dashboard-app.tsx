import {
  Play,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DashboardHeader,
  DashboardPage,
  MockTerminal,
  PageTabsBar,
  PanelCard,
  RingGauge,
  StatCard,
  StatusDot,
} from "@/shared/dashboard-ui";
import { cn } from "@/shared/lib/utils";
import {
  DOCKER_MOCK_CONTAINERS,
  DOCKER_MOCK_LOGS,
  DOCKER_MOCK_STATS,
} from "../mock/docker-mock";
import { useDockerUiStore } from "../mock/docker-ui-store";

/** Mock-only Docker workspace: Dashboard + Container Detail. */
export function DockerDashboardApp() {
  const page = useDockerUiStore((s) => s.page);
  if (page === "detail") {
    return <ContainerDetailPage />;
  }
  return <DockerDashboardPage />;
}

function DockerDashboardPage() {
  const selectedId = useDockerUiStore((s) => s.selectedContainerId);
  const selectContainer = useDockerUiStore((s) => s.selectContainer);
  const openDetail = useDockerUiStore((s) => s.openDetail);
  const consoleTab = useDockerUiStore((s) => s.consoleTab);
  const setConsoleTab = useDockerUiStore((s) => s.setConsoleTab);
  const selected =
    DOCKER_MOCK_CONTAINERS.find((c) => c.id === selectedId) ?? DOCKER_MOCK_CONTAINERS[0]!;

  return (
    <DashboardPage>
      <DashboardHeader
        title="Docker"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-2.5 py-0.5 text-[12px]">
            <span className="size-1.5 rounded-full bg-success" />
            Running
          </span>
        }
        onRefresh={() => toast.message("Mock refresh")}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Containers" value={String(DOCKER_MOCK_STATS.containers)} hint="Total" />
        <StatCard label="Images" value={String(DOCKER_MOCK_STATS.images)} hint="Local" />
        <StatCard
          label="CPU Usage"
          value={`${DOCKER_MOCK_STATS.cpuPercent}%`}
          progress={DOCKER_MOCK_STATS.cpuPercent}
        />
        <StatCard
          label="Memory Usage"
          value={`${DOCKER_MOCK_STATS.memPercent}%`}
          progress={DOCKER_MOCK_STATS.memPercent}
        />
      </div>

      <PanelCard
        title="Container List"
        action={
          <Button size="sm" onClick={() => toast.message("Run Container (mock)")}>
            + Run Container
          </Button>
        }
      >
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-border-subtle text-[11px] text-muted-foreground">
              {["Name", "Image", "Status", "Port", "Uptime", "Actions"].map((h) => (
                <th key={h} className="h-9 px-4 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOCKER_MOCK_CONTAINERS.map((c) => {
              const selected = c.id === selectedId;
              return (
                <tr
                  key={c.id}
                  className={cn(
                    "h-11 cursor-pointer border-b border-border-subtle/80 hover:bg-surface-hover",
                    selected && "bg-primary/5",
                  )}
                  onClick={() => selectContainer(c.id)}
                  onDoubleClick={() => openDetail(c.id)}
                >
                  <td className="px-4">
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(c.id);
                      }}
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="px-4 font-mono text-[12px]">{c.image}</td>
                  <td className="px-4">
                    <StatusDot
                      label={c.status}
                      tone={c.status === "Running" ? "success" : "danger"}
                    />
                  </td>
                  <td className="px-4 font-mono text-[12px]">{c.ports}</td>
                  <td className="px-4 text-muted-foreground">{c.uptime}</td>
                  <td className="px-4">
                    <div className="flex gap-1 text-muted-foreground">
                      <button type="button" title="Start" onClick={() => toast.message("Start (mock)")}>
                        <Play className="size-3.5" />
                      </button>
                      <button type="button" title="Stop" onClick={() => toast.message("Stop (mock)")}>
                        <Square className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Terminal"
                        onClick={() => toast.message("Terminal (mock)")}
                      >
                        <Terminal className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PanelCard>

      <div className="grid min-h-[240px] grid-cols-1 gap-3 lg:grid-cols-[1fr_140px]">
        <PanelCard>
          <div className="px-4 pt-1">
            <div className="mb-1 flex items-center gap-2 text-[12px] text-muted-foreground">
              <span>Container</span>
              <select
                className="h-7 rounded-[6px] border border-border bg-white px-2 font-mono text-[12px]"
                value={selected.id}
                onChange={(e) => selectContainer(e.target.value)}
              >
                {DOCKER_MOCK_CONTAINERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <PageTabsBar
              items={[
                { id: "overview", label: "Overview" },
                { id: "logs", label: "Logs" },
                { id: "ports", label: "Ports" },
                { id: "stats", label: "Stats" },
              ]}
              value={consoleTab}
              onChange={(id) => setConsoleTab(id as typeof consoleTab)}
            />
          </div>
          <div className="p-3">
            {consoleTab === "logs" || consoleTab === "overview" ? (
              <MockTerminal lines={DOCKER_MOCK_LOGS} className="min-h-[180px]" title="Logs" />
            ) : consoleTab === "ports" ? (
              <p className="p-2 font-mono text-[13px]">{selected.ports}</p>
            ) : (
              <div className="flex gap-8 p-4">
                <RingGauge value={selected.cpuPercent} label="CPU" />
                <RingGauge value={selected.memPercent} label="Memory" color="#7c3aed" />
              </div>
            )}
          </div>
        </PanelCard>
        <div className="flex flex-col gap-2 rounded-[10px] border border-border-subtle bg-white p-3">
          {(
            [
              ["Start", Play],
              ["Stop", Square],
              ["Restart", RotateCcw],
              ["Terminal", Terminal],
              ["View Log", ScrollText],
              ["Delete", Trash2],
            ] as const
          ).map(([label, Icon]) => (
            <button
              key={label}
              type="button"
              className="flex h-9 items-center gap-2 rounded-[7px] px-2 text-left text-[12px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              onClick={() => toast.message(`${label} (mock)`)}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </DashboardPage>
  );
}

function ContainerDetailPage() {
  const openDashboard = useDockerUiStore((s) => s.openDashboard);
  const selectedId = useDockerUiStore((s) => s.selectedContainerId);
  const detailTab = useDockerUiStore((s) => s.detailTab);
  const setDetailTab = useDockerUiStore((s) => s.setDetailTab);
  const c =
    DOCKER_MOCK_CONTAINERS.find((x) => x.id === selectedId) ?? DOCKER_MOCK_CONTAINERS[0]!;

  return (
    <DashboardPage>
      <div className="text-[12px] text-muted-foreground">
        <button type="button" className="hover:text-primary" onClick={openDashboard}>
          Docker
        </button>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Container</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-semibold">Container Detail: {c.name}</h1>
        <StatusDot label={c.status} tone={c.status === "Running" ? "success" : "danger"} />
      </div>

      <PageTabsBar
        items={[
          { id: "overview", label: "Overview" },
          { id: "logs", label: "Logs" },
          { id: "stats", label: "Stats" },
          { id: "events", label: "Events" },
        ]}
        value={detailTab}
        onChange={(id) => setDetailTab(id as typeof detailTab)}
      />

      {detailTab === "overview" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <PanelCard title="Basic Info">
            <dl className="grid grid-cols-2 gap-3 p-4 text-[13px]">
              {[
                ["Name", c.name],
                ["Image", c.image],
                ["Status", c.status],
                ["IP", c.ip],
                ["Port", c.ports],
                ["Start Time", c.startedAt],
                ["Uptime", c.uptime],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="font-mono text-[12px]">{v}</dd>
                </div>
              ))}
            </dl>
          </PanelCard>
          <PanelCard title="Resource Usage">
            <div className="flex justify-around p-6">
              <RingGauge value={c.cpuPercent} label="CPU" />
              <RingGauge value={c.memPercent} label="Memory" color="#7c3aed" />
            </div>
          </PanelCard>
        </div>
      ) : null}

      {detailTab === "logs" ? <MockTerminal lines={DOCKER_MOCK_LOGS} className="min-h-[320px]" /> : null}

      {detailTab === "stats" ? (
        <PanelCard title="Stats">
          <div className="flex gap-10 p-6">
            <RingGauge value={c.cpuPercent} label="CPU" />
            <RingGauge value={c.memPercent} label="Memory" color="#7c3aed" />
          </div>
        </PanelCard>
      ) : null}

      {detailTab === "events" ? (
        <PanelCard title="Events">
          <p className="p-4 text-[13px] text-muted-foreground">No recent events (mock).</p>
        </PanelCard>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["Stop", Square],
            ["Restart", RotateCcw],
            ["Terminal", Terminal],
            ["View Logs", ScrollText],
            ["Delete", Trash2],
          ] as const
        ).map(([label, Icon]) => (
          <Button
            key={label}
            variant={label === "Delete" ? "danger" : "secondary"}
            size="sm"
            className="gap-1.5"
            onClick={() => toast.message(`${label} (mock)`)}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
    </DashboardPage>
  );
}
