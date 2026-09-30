/** Format Jenkins build duration / relative time for Dashboard. */

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) {
    return "—";
  }
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) {
    return `${s}s`;
  }
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function formatBuildTime(timestampMs: number | null | undefined): string {
  if (timestampMs == null || timestampMs <= 0) {
    return "—";
  }
  const diff = Date.now() - timestampMs;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

/** 按本地日历日分组键，如 2026年4月3日 */
export function formatBuildDateGroup(timestampMs: number): string {
  const d = new Date(timestampMs);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 当天时刻，如 下午3:46 */
export function formatBuildClock(timestampMs: number): string {
  const d = new Date(timestampMs);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  if (h < 12) return `上午${h === 0 ? 12 : h}:${m}`;
  if (h === 12) return `下午12:${m}`;
  return `下午${h - 12}:${m}`;
}

export function jobTypeLabel(className: string): string {
  if (className.includes("WorkflowJob")) return "Pipeline";
  if (className.includes("Maven")) return "Maven";
  if (className.includes("FreeStyle")) return "Freestyle";
  if (className.includes("Folder")) return "Folder";
  return className.split(".").pop() || "Job";
}
