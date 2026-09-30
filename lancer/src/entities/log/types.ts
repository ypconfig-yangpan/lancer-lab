export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "UNKNOWN";

export interface LogLine {
  id: string;
  lineNumber: number;
  timestamp: string;
  level: LogLevel;
  pod: string;
  container: string;
  message: string;
}

/** Host-owned log session; Disk-as-Source under app_data/managed-logs. */
export type LogSessionStatus = "open" | "following" | "paused" | "closed" | "error";

export interface LogSessionInfo {
  sessionId: string;
  provider: string;
  sourceLabel: string;
  status: LogSessionStatus;
  /** Total lines available in the session source (may grow while following). */
  totalLines: number;
  truncated: boolean;
}

export interface LogWindowRequest {
  sessionId: string;
  /** 0-based start line index into the source. */
  offset: number;
  limit: number;
}

export interface LogWindow {
  sessionId: string;
  offset: number;
  lines: LogLine[];
  totalLines: number;
  truncated: boolean;
}
