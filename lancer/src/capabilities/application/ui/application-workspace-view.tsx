import { useState } from "react";
import { SlotHost, useSlotContributions } from "@/shell";
import {
  Badge,
  Button,
  DataTableFrame,
  PageHeader,
  PageTabs,
  StatusBadge,
  dataTableRowClass,
} from "@lancer/ui";
import { useApplicationWorkspaceStore } from "../application-workspace-store";
import {
  APPLICATION_CATALOG,
  APPLICATION_EVENTS,
  STAGE_FALLBACKS,
} from "../mock/mock-data";

const APPLICATION_SLOTS = [
  { slotId: "application.source", title: "Source" },
  { slotId: "application.build", title: "Build" },
  { slotId: "application.release", title: "Release" },
  { slotId: "application.runtime", title: "Runtime" },
  { slotId: "application.observability", title: "Observability" },
] as const;

/** Experience UI: Stage cards + Events — Slot when Providers active, else catalog fallback. */
export function ApplicationWorkspaceView() {
  const selectedAppId = useApplicationWorkspaceStore((s) => s.selectedAppId);
  const selected =
    APPLICATION_CATALOG.find((app) => app.id === selectedAppId) ?? APPLICATION_CATALOG[0] ?? null;
  const [tab, setTab] = useState("overview");

  const source = useSlotContributions("application.source");
  const build = useSlotContributions("application.build");
  const release = useSlotContributions("application.release");
  const runtime = useSlotContributions("application.runtime");
  const observability = useSlotContributions("application.observability");

  const bySlot = {
    "application.source": source,
    "application.build": build,
    "application.release": release,
    "application.runtime": runtime,
    "application.observability": observability,
  } as const;

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        Select an application
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-1">
      <PageHeader
        title={selected.name}
        badge={selected.env}
        status={selected.status}
        statusTone={selected.status === "Healthy" ? "success" : "warning"}
        description={selected.description}
        actions={
          <>
            <Button variant="secondary" size="sm">
              Refresh
            </Button>
            <Button size="sm">Actions</Button>
          </>
        }
      />
      <PageTabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "topology", label: "Topology" },
          { id: "services", label: "Services" },
          { id: "deployments", label: "Deployments" },
          { id: "config", label: "Config" },
          { id: "security", label: "Security" },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "overview" ? (
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-stretch gap-2">
              {APPLICATION_SLOTS.map((slot, index) => {
                const items = bySlot[slot.slotId];
                const fallback = STAGE_FALLBACKS[slot.slotId];
                return (
                  <div key={slot.slotId} className="flex items-stretch gap-2">
                    <section className="min-w-[140px] flex-1 rounded-[8px] border border-border-subtle bg-surface-1 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {slot.title}
                      </div>
                      {items.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {items.map((item) => (
                            <SlotHost
                              key={`${item.slotId}:${item.id}`}
                              contribution={item}
                            />
                          ))}
                        </div>
                      ) : fallback ? (
                        <div className="mt-2 space-y-1">
                          <div className="text-[13px] font-medium">{fallback.provider}</div>
                          <div className="font-mono text-[12px]">{fallback.primary}</div>
                          <StatusBadge tone={fallback.tone} label={fallback.secondary} />
                        </div>
                      ) : null}
                    </section>
                    {index < APPLICATION_SLOTS.length - 1 ? (
                      <div className="flex items-center text-muted-foreground" aria-hidden>
                        →
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-4 text-[12px] text-muted-foreground">
              <span>Endpoints 3</span>
              <span>Services 6</span>
              <span>Pods 3/3</span>
              <span>ConfigMaps 4</span>
              <span>Secrets 6</span>
            </div>

            <div className="flex flex-wrap gap-1">
              {selected.tags.map((tag) => (
                <Badge key={tag} tone="accent">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 text-[13px] text-muted-foreground">
            {tab} — catalog placeholder (mock only)
          </div>
        )}

        <DataTableFrame title="Events">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-border-subtle text-[11px] uppercase text-muted-foreground">
                <th className="h-9 px-3 font-semibold">Time</th>
                <th className="h-9 px-3 font-semibold">Provider</th>
                <th className="h-9 px-3 font-semibold">Description</th>
                <th className="h-9 px-3 font-semibold">Resource</th>
                <th className="h-9 px-3 font-semibold">Age</th>
              </tr>
            </thead>
            <tbody>
              {APPLICATION_EVENTS.map((event, i) => (
                <tr key={event.id} className={dataTableRowClass(i === 0)}>
                  <td className="h-11 px-3 font-mono text-[12px] text-muted-foreground">
                    {event.at}
                  </td>
                  <td className="h-11 px-3">{event.provider}</td>
                  <td className="h-11 px-3">{event.description}</td>
                  <td className="h-11 px-3 font-mono text-[12px] text-muted-foreground">
                    {event.resource}
                  </td>
                  <td className="h-11 px-3 text-muted-foreground">{event.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableFrame>
      </div>
    </div>
  );
}
