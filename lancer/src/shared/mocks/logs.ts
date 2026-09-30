import type { LogLevel, LogLine } from "@/entities/log/types";

const LEVELS: LogLevel[] = ["INFO", "INFO", "INFO", "WARN", "ERROR", "DEBUG"];

/** Generate a bounded mock log window for Phase 0 virtualization demos. */
export function createMockLogLines(count: number, pod = "servicea-7d9f8c6b4d-xk2nq"): LogLine[] {
  const lines: LogLine[] = [];
  const base = Date.parse("2026-09-01T02:00:00.000Z");

  for (let i = 0; i < count; i += 1) {
    const level = LEVELS[i % LEVELS.length] ?? "UNKNOWN";
    lines.push({
      id: `log-${i}`,
      lineNumber: i + 1,
      timestamp: new Date(base + i * 250).toISOString(),
      level,
      pod,
      container: "app",
      message:
        level === "ERROR"
          ? `Failed to handle request id=${i} status=500`
          : level === "WARN"
            ? `Slow request id=${i} durationMs=${200 + (i % 50)}`
            : `Handled GET /api/health id=${i}`,
    });
  }

  return lines;
}
