import { useState } from "react";

/** Minimal mock row for stub tool workspaces (no apply / contributions). */
export interface StubRow {
  id: string;
  name: string;
  status?: string;
  detail?: string;
}

export function StubExplorerPane({
  title,
  items,
}: {
  title: string;
  items: { id: string; label: string }[];
}) {
  return (
    <div className="flex h-full flex-col gap-1 p-2 text-[13px]">
      <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id} className="rounded-[6px] px-2 py-1.5 text-foreground">
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StubResourcesPane({
  title,
  rows,
  emptyHint = "No mock rows",
}: {
  title: string;
  rows: StubRow[];
  emptyHint?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col bg-surface-1 text-[13px]">
      <div className="border-b border-border px-3 py-2 font-medium">{title}</div>
      <div className="flex min-h-0 flex-1">
        <ul className="w-1/2 overflow-auto border-r border-border p-2">
          {rows.length === 0 ? (
            <li className="px-2 py-4 text-muted-foreground">{emptyHint}</li>
          ) : (
            rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-left hover:bg-surface-hover ${
                    selectedId === row.id ? "bg-surface-selected" : ""
                  }`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span className="font-mono text-[12px]">{row.name}</span>
                  {row.status ? (
                    <span className="text-[11px] text-muted-foreground">{row.status}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="w-1/2 overflow-auto p-3 text-muted-foreground">
          {selected ? (
            <>
              <div className="font-medium text-foreground">{selected.name}</div>
              {selected.status ? <div className="mt-1">Status: {selected.status}</div> : null}
              {selected.detail ? <div className="mt-2 whitespace-pre-wrap">{selected.detail}</div> : null}
              <div className="mt-4 text-[11px]">Stub catalog — not live backend.</div>
            </>
          ) : (
            emptyHint
          )}
        </div>
      </div>
    </div>
  );
}
