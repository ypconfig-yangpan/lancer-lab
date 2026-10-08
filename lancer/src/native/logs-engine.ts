import type { LogLine, LogSessionInfo, LogWindow } from "@/entities/log/types";
import type {
  NativeLogFindAtTimeInput,
  NativeLogFindAtTimeResult,
  NativeLogOpenInput,
  NativeLogSearchInput,
  NativeLogSearchResult,
  NativeLogSession,
  NativeLogsApi,
  NativeLogWindowInput,
} from "./types";
import { NativeCapabilityError } from "./errors";

interface InternalSession {
  info: LogSessionInfo;
  lines: LogLine[];
}

const LEVELS = ["INFO", "INFO", "INFO", "WARN", "ERROR", "DEBUG"] as const;

function generateMockLines(count: number, pod: string, container: string): LogLine[] {
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
      container,
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

/**
 * In-memory log engine for unit tests / non-Tauri hosts.
 * Production default is Disk-as-Source via createDefaultLogsNativeApi (Tauri).
 */
export function createInMemoryLogsNativeApi(options?: {
  defaultLineCount?: number;
}): NativeLogsApi {
  const defaultLineCount = options?.defaultLineCount ?? 20_000;
  const sessions = new Map<string, InternalSession>();

  return {
    async open(input: NativeLogOpenInput): Promise<NativeLogSession> {
      const sessionId = crypto.randomUUID();
      const pod = input.pod ?? "servicea-7d9f8c6b4d-xk2nq";
      const container = input.container ?? "app";
      const lines = generateMockLines(defaultLineCount, pod, container);
      const info: LogSessionInfo = {
        sessionId,
        provider: input.provider,
        sourceLabel: `${input.namespace ?? "default"}/${pod}/${container}`,
        status: input.follow === false ? "open" : "following",
        totalLines: lines.length,
        truncated: false,
      };
      sessions.set(sessionId, { info, lines });
      return { sessionId };
    },

    async close(sessionId: string): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new NativeCapabilityError("LOG_FILE_NOT_FOUND", `log session not found: ${sessionId}`);
      }
      session.info.status = "closed";
      sessions.delete(sessionId);
    },

    async readWindow(input: NativeLogWindowInput): Promise<LogWindow> {
      const session = sessions.get(input.sessionId);
      if (!session) {
        throw new NativeCapabilityError(
          "LOG_FILE_NOT_FOUND",
          `log session not found: ${input.sessionId}`,
        );
      }
      const limit = Math.min(Math.max(input.limit, 1), 5_000);
      const offset = Math.max(input.offset, 0);
      const slice = session.lines.slice(offset, offset + limit);
      return {
        sessionId: input.sessionId,
        offset,
        lines: slice,
        totalLines: session.lines.length,
        truncated: session.lines.length > offset + slice.length,
      };
    },

    async getSession(sessionId: string): Promise<LogSessionInfo> {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new NativeCapabilityError(
          "LOG_FILE_NOT_FOUND",
          `log session not found: ${sessionId}`,
        );
      }
      return { ...session.info, totalLines: session.lines.length };
    },

    async search(input: NativeLogSearchInput): Promise<NativeLogSearchResult> {
      const session = sessions.get(input.sessionId);
      if (!session) {
        throw new NativeCapabilityError(
          "LOG_FILE_NOT_FOUND",
          `log session not found: ${input.sessionId}`,
        );
      }
      const max = Math.min(Math.max(input.maxMatches ?? 200, 1), 5_000);
      const cursor = input.cursorByte ?? 0;
      const pattern = input.pattern;
      if (!pattern) {
        return { matches: [], nextCursorByte: null, hasMore: false, truncated: false };
      }
      let re: RegExp;
      try {
        const body = input.regex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        re = new RegExp(body, input.caseSensitive ? "" : "i");
      } catch {
        throw new NativeCapabilityError("LOG_STREAM_FAILED", "invalid search pattern");
      }
      const matches: NativeLogSearchResult["matches"] = [];
      let lastByte = cursor;
      for (let i = 0; i < session.lines.length; i += 1) {
        const line = session.lines[i]!;
        // Approximate byte cursor: line index (engine has no real offsets).
        const approxByte = i;
        if (approxByte < cursor) continue;
        // Match message + level only (same contract as Rust Disk search).
        const haystack = `${line.level} ${line.message}`;
        if (!re.test(haystack)) continue;
        matches.push({ lineNumber: line.lineNumber, byteOffset: approxByte });
        lastByte = approxByte;
        if (matches.length >= max) {
          return {
            matches,
            nextCursorByte: lastByte + 1,
            hasMore: true,
            truncated: true,
          };
        }
      }
      return { matches, nextCursorByte: null, hasMore: false, truncated: false };
    },

    async cancelSearch(_sessionId: string): Promise<void> {
      // In-memory search is sync; nothing to cancel.
    },

    async findLineAtTime(input: NativeLogFindAtTimeInput): Promise<NativeLogFindAtTimeResult> {
      const session = sessions.get(input.sessionId);
      if (!session) {
        throw new NativeCapabilityError(
          "LOG_FILE_NOT_FOUND",
          `log session not found: ${input.sessionId}`,
        );
      }
      const target = input.target.trim();
      if (!target) {
        return { lineNumber: null, found: false };
      }
      const isIso = target.includes("-") || target.includes("T");
      for (const line of session.lines) {
        if (!line.timestamp) continue;
        const hit = isIso
          ? line.timestamp >= target
          : line.timestamp.includes(target);
        if (hit) {
          return { lineNumber: line.lineNumber, found: true };
        }
      }
      return { lineNumber: null, found: false };
    },
  };
}
