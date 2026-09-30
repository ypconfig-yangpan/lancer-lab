import { useEffect, useState } from "react";
import { formatDurationMs } from "@/capabilities/jenkins/format";
import { cn } from "@/shared/lib/utils";

/**
 * Jenkins 风格构建进度：elapsed / estimatedDuration。
 * 超时后条满并轻微脉冲，文案显示已超出预估。
 */
export function JenkinsBuildProgressBar({
  building,
  startedAtMs,
  estimatedDurationMs,
  buildNumber,
  className,
}: {
  building: boolean;
  startedAtMs: number;
  estimatedDurationMs: number;
  buildNumber?: number | null;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!building) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [building, startedAtMs]);

  if (!building || startedAtMs <= 0) return null;

  const elapsed = Math.max(0, now - startedAtMs);
  const estimate = estimatedDurationMs > 0 ? estimatedDurationMs : 0;
  const rawPct = estimate > 0 ? (elapsed / estimate) * 100 : 15;
  const over = rawPct >= 100;
  const pct = estimate > 0 ? Math.min(100, rawPct) : Math.min(90, 10 + (elapsed / 1000) * 2);
  const remain =
    estimate > 0 && !over
      ? `约剩 ${formatDurationMs(Math.max(0, estimate - elapsed))}`
      : over
        ? `已超预估 ${formatDurationMs(elapsed - estimate)}`
        : "估算中…";

  return (
    <div
      className={cn(
        "rounded-[10px] border border-border-subtle bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="font-medium text-foreground">
          {buildNumber != null ? `#${buildNumber} ` : ""}
          构建进度
        </span>
        <span className="text-muted-foreground">
          已用 {formatDurationMs(elapsed)}
          {estimate > 0 ? ` · 预估 ${formatDurationMs(estimate)}` : ""} · {remain}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#eef2f7]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-linear",
            over ? "bg-warning animate-pulse" : "bg-primary",
          )}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        {estimate > 0 ? `${Math.round(Math.min(rawPct, 999))}%` : "无历史预估，进度为示意"}
      </div>
    </div>
  );
}
