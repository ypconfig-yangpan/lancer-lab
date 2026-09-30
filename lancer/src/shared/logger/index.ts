import { invoke } from "@tauri-apps/api/core";
import { type LogFields, redactFields } from "@/shared/logger/redact";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

type PersistableLevel = "info" | "warn" | "error";

const isDev = import.meta.env.DEV;

function writeConsole(level: LogLevel, message: string, fields: LogFields | undefined): void {
  const payload = fields === undefined ? [message] : [message, fields];
  switch (level) {
    case "error":
      console.error(...payload);
      break;
    case "warn":
      console.warn(...payload);
      break;
    case "info":
      console.info(...payload);
      break;
    case "debug":
    case "trace":
      console.debug(...payload);
      break;
    default: {
      const _exhaustive: never = level;
      void _exhaustive;
    }
  }
}

async function persist(
  level: PersistableLevel,
  message: string,
  fields: LogFields | undefined,
): Promise<void> {
  try {
    await invoke("report_frontend_log", {
      event: {
        level,
        message,
        fields: fields === undefined ? null : fields,
      },
    });
  } catch {
    // Vite-only / IPC unavailable: console already has the record in DEV.
  }
}

function emit(
  level: LogLevel,
  message: string,
  fields: LogFields | undefined,
  shouldPersist: boolean,
): void {
  const safeFields = fields === undefined ? undefined : redactFields(fields);
  if (isDev || level === "warn" || level === "error") {
    writeConsole(level, message, safeFields);
  }
  if (shouldPersist) {
    const persistLevel: PersistableLevel = level === "error" || level === "warn" ? level : "info";
    void persist(persistLevel, message, safeFields);
  }
}

export const logger = {
  trace(message: string, fields?: LogFields): void {
    if (isDev) {
      emit("trace", message, fields, false);
    }
  },
  debug(message: string, fields?: LogFields): void {
    if (isDev) {
      emit("debug", message, fields, false);
    }
  },
  info(message: string, fields?: LogFields): void {
    emit("info", message, fields, false);
  },
  warn(message: string, fields?: LogFields & { persist?: boolean }): void {
    if (fields === undefined) {
      emit("warn", message, undefined, false);
      return;
    }
    const persistFlag = fields.persist === true;
    const rest: LogFields = {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === "persist") {
        continue;
      }
      rest[key] = value;
    }
    emit("warn", message, rest, persistFlag);
  },
  error(message: string, fields?: LogFields): void {
    emit("error", message, fields, true);
  },
  /** Lifecycle that must reach app.log (cluster connected, export started, …). */
  operation(message: string, fields?: LogFields): void {
    emit("info", message, fields, true);
  },
};
