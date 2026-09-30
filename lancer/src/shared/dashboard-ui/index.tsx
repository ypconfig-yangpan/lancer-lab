import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";

export function DashboardPage({
  children,
  className,
  fill = false,
}: {
  children: ReactNode;
  className?: string;
  /** Fill parent and manage internal scroll (dashboard split layouts). */
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-[1400px] flex-col gap-4 p-5",
        fill ? "h-full min-h-0 overflow-hidden" : "min-h-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DashboardHeader({
  title,
  badge,
  trailing,
  onRefresh,
}: {
  title: string;
  badge?: ReactNode;
  trailing?: ReactNode;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
      {badge}
      <div className="ml-auto flex items-center gap-2">
        {trailing}
        {onRefresh ? (
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  progress,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  progress?: number;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : tone === "info"
            ? "text-primary"
            : "text-foreground";
  return (
    <div className="rounded-[10px] border border-border-subtle bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-[22px] font-semibold tracking-tight", toneClass)}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
      {typeof progress === "number" ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef2f7]">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function PanelCard({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[10px] border border-border-subtle bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {title ? (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <span className="text-[13px] font-semibold">{title}</span>
          {action ? <div className="ml-auto">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}

export function StatusDot({
  label,
  tone = "success",
}: {
  label: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-destructive"
          : tone === "info"
            ? "bg-primary"
            : "bg-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

export function Sparkline({
  points,
  className,
  stroke = "#1677ff",
}: {
  points: number[];
  className?: string;
  stroke?: string;
}) {
  const w = 160;
  const h = 48;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const path = points
    .map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * w;
      const y = h - ((p - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-12 w-full", className)} aria-hidden>
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function RingGauge({
  value,
  label,
  color = "#1677ff",
}: {
  value: number;
  label: string;
  color?: string;
}) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = c * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden>
        <circle cx="36" cy="36" r={r} fill="none" stroke="#eef2f7" strokeWidth="8" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
        />
        <text
          x="36"
          y="40"
          textAnchor="middle"
          fill="currentColor"
          fontSize="12"
          fontWeight="600"
        >
          {pct}%
        </text>
      </svg>
      <span className="text-[12px] text-muted-foreground">{label}</span>
    </div>
  );
}

export function MockTerminal({
  lines,
  title = "Real-time Log",
  className,
  colorize = false,
}: {
  lines: string[];
  title?: string;
  className?: string;
  /** 简单关键字/ANSI 着色（Jenkins 控制台） */
  colorize?: boolean;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-[8px] bg-[#0f1419]", className)}>
      <div className="flex h-8 shrink-0 items-center border-b border-white/10 px-3 text-[11px] font-semibold tracking-wide text-[#9ca3af]">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-5 text-[#d1d5db]">
        {lines.map((line, i) => (
          <div key={`${i}-${line.slice(0, 24)}`} className="whitespace-pre-wrap">
            <span className="mr-2 select-none text-[#6b7280]">
              {String(i + 1).padStart(3, "0")}
            </span>
            {colorize ? <ColoredLogLine line={line} /> : line}
          </div>
        ))}
      </div>
    </div>
  );
}

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

function ColoredLogLine({ line }: { line: string }) {
  const plain = stripAnsi(line);
  const upper = plain.toUpperCase();
  let cls = "text-[#d1d5db]";
  if (/FINISHED:\s*SUCCESS|\bBUILD SUCCESS\b|\bSUCCESS\b/.test(upper) && !/FAILURE/.test(upper)) {
    cls = "text-[#4ade80]";
  } else if (/FINISHED:\s*FAILURE|\bFAILURE\b|\bERROR\b|\bEXCEPTION\b|\bFATAL\b/.test(upper)) {
    cls = "text-[#f87171]";
  } else if (/FINISHED:\s*ABORTED|\bABORTED\b/.test(upper)) {
    cls = "text-[#fbbf24]";
  } else if (/\bWARN(ING)?\b/.test(upper)) {
    cls = "text-[#fbbf24]";
  } else if (/\bINFO\b|\[INFO\]/.test(upper)) {
    cls = "text-[#93c5fd]";
  } else if (/\[ERROR\]|\[WARNING\]/.test(plain)) {
    cls = plain.includes("[ERROR]") ? "text-[#f87171]" : "text-[#fbbf24]";
  }
  return <span className={cls}>{plain}</span>;
}

export function PageTabsBar({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border-subtle">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            className={cn(
              "relative -mb-px py-2.5 text-[13px]",
              item.disabled && "cursor-not-allowed text-muted-foreground/40",
              !item.disabled && active && "font-semibold text-primary",
              !item.disabled && !active && "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              if (!item.disabled) onChange(item.id);
            }}
          >
            {item.label}
            {active && !item.disabled ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t bg-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
