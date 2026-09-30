import type { LogLevel, LogLine, LogSessionInfo, LogWindow } from "@/entities/log/types";
import { invokeCommand, TauriInvokeError } from "@/shared/tauri";
import { NativeCapabilityError, type NativeErrorCode } from "./errors";
import type {
  NativeLogOpenInput,
  NativeLogsApi,
  NativeLogSession,
  NativeLogWindowInput,
} from "./types";

interface LogLineDto {
  id: string;
  lineNumber: number;
  timestamp: string;
  level: string;
  pod: string;
  container: string;
  message: string;
}

interface LogSessionInfoDto {
  sessionId: string;
  provider: string;
  sourceLabel: string;
  status: string;
  totalLines: number;
  truncated: boolean;
  filePath?: string;
}

interface LogWindowDto {
  sessionId: string;
  offset: number;
  lines: LogLineDto[];
  totalLines: number;
  truncated: boolean;
}

function normalizeLevel(level: string): LogLevel {
  switch (level) {
    case "ERROR":
    case "WARN":
    case "INFO":
    case "DEBUG":
    case "UNKNOWN":
      return level;
    default:
      return "UNKNOWN";
  }
}

function mapLine(dto: LogLineDto): LogLine {
  return {
    id: dto.id,
    lineNumber: dto.lineNumber,
    timestamp: dto.timestamp,
    level: normalizeLevel(dto.level),
    pod: dto.pod,
    container: dto.container,
    message: dto.message,
  };
}

function mapSession(dto: LogSessionInfoDto): LogSessionInfo {
  const status = dto.status;
  return {
    sessionId: dto.sessionId,
    provider: dto.provider,
    sourceLabel: dto.sourceLabel,
    status:
      status === "open" ||
      status === "following" ||
      status === "paused" ||
      status === "closed" ||
      status === "error"
        ? status
        : "open",
    totalLines: dto.totalLines,
    truncated: dto.truncated,
  };
}

function mapLogsError(error: unknown, capability: string): never {
  if (error instanceof NativeCapabilityError) {
    throw error;
  }
  if (error instanceof TauriInvokeError) {
    const code = error.appError.code;
    if (
      code === "LOG_FILE_NOT_FOUND" ||
      code === "LOG_DISK_FULL" ||
      code === "LOG_STREAM_FAILED" ||
      code === "LOG_STREAM_INTERRUPTED"
    ) {
      throw new NativeCapabilityError(code as NativeErrorCode, error.appError.message, {
        retryable: error.appError.retryable,
      });
    }
    throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", error.appError.message, {
      retryable: true,
    });
  }
  const message = error instanceof Error ? error.message : `${capability} failed`;
  throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", message, { retryable: true });
}

async function bridgeCall<T>(capability: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    mapLogsError(error, capability);
  }
}

/**
 * Disk-as-Source bridge. With connectionId → kube follow (2.2b); else seed file (2.2a).
 * Seed / stream files live under app_data/managed-logs — not Desktop app.log.
 */
export function createDefaultLogsNativeApi(): NativeLogsApi {
  return {
    open(input: NativeLogOpenInput): Promise<NativeLogSession> {
      return bridgeCall("logs.open", async () => {
        const info = await invokeCommand<LogSessionInfoDto>("open_managed_log_session", {
          input: {
            provider: input.provider,
            connectionId: input.connectionId ?? null,
            namespace: input.namespace ?? null,
            pod: input.pod ?? null,
            container: input.container ?? null,
            follow: input.follow ?? true,
            seedLines: null,
          },
        });
        return { sessionId: info.sessionId };
      });
    },

    close(sessionId: string): Promise<void> {
      return bridgeCall("logs.close", () =>
        invokeCommand("close_managed_log_session", {
          input: { sessionId },
        }),
      );
    },

    readWindow(input: NativeLogWindowInput): Promise<LogWindow> {
      return bridgeCall("logs.readWindow", async () => {
        const dto = await invokeCommand<LogWindowDto>("read_managed_log_window", {
          input: {
            sessionId: input.sessionId,
            offset: input.offset,
            limit: input.limit,
          },
        });
        return {
          sessionId: dto.sessionId,
          offset: dto.offset,
          lines: dto.lines.map(mapLine),
          totalLines: dto.totalLines,
          truncated: dto.truncated,
        };
      });
    },

    getSession(sessionId: string): Promise<LogSessionInfo> {
      return bridgeCall("logs.getSession", async () => {
        const dto = await invokeCommand<LogSessionInfoDto>("get_managed_log_session", {
          input: { sessionId },
        });
        return mapSession(dto);
      });
    },

    setPaused(sessionId: string, paused: boolean): Promise<LogSessionInfo> {
      return bridgeCall("logs.setPaused", async () => {
        const dto = await invokeCommand<LogSessionInfoDto>("pause_managed_log_session", {
          input: { sessionId, paused },
        });
        return mapSession(dto);
      });
    },
  };
}
