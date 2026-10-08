/**
 * Native Capability surface for plugins (ADR 0013).
 * Plugins use ctx.native.* — never hard-code Tauri command names.
 *
 * V1: thin facade. Some capabilities bridge to existing Rust commands;
 * others return NATIVE_UNAVAILABLE until implemented.
 */

import type { LogSessionInfo, LogWindow } from "@/entities/log/types";
import type { NativeArgocdApi } from "./argocd";
import type { NativeDockerApi } from "./docker";
import type { NativeGitApi } from "./git";
import type { NativeHarborApi } from "./harbor";
import type { NativeJenkinsApi } from "./jenkins";
import type { NativeKubernetesApi } from "./kubernetes";
import type { NativeSshApi } from "./ssh";

export interface NativeProcessExecInput {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface NativeProcessExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface NativeProcessApi {
  /**
   * Run a host process under Rust process control.
   * V1: not enabled for arbitrary shell (product forbids host shell); returns NATIVE_FORBIDDEN.
   */
  exec(input: NativeProcessExecInput): Promise<NativeProcessExecResult>;
}

export interface NativeFsApi {
  readText(path: string): Promise<string>;
  writeText(path: string, contents: string): Promise<void>;
}

export interface NativeCredentialsApi {
  /** Reveal is explicit; V1 returns unavailable. */
  getSecret(ref: string): Promise<string | null>;
}

export interface NativeLogOpenInput {
  provider: string;
  connectionId?: string;
  namespace?: string;
  pod?: string;
  container?: string;
  follow?: boolean;
  /** Previous container instance (kube previous). */
  previous?: boolean;
  /** Only logs newer than now − sinceSeconds. */
  sinceSeconds?: number;
  /** History depth when opening follow (kube tail_lines). */
  tailLines?: number;
}

export interface NativeLogSession {
  sessionId: string;
  /** Grace Period re-attach hit an existing Detached/Active session. */
  fromCache?: boolean;
}

export interface NativeLogWindowInput {
  sessionId: string;
  offset: number;
  limit: number;
}

/** Locate-only match; text comes from readWindow. */
export interface NativeLogSearchMatch {
  lineNumber: number;
  byteOffset: number;
}

export interface NativeLogSearchInput {
  sessionId: string;
  pattern: string;
  regex?: boolean;
  caseSensitive?: boolean;
  maxMatches?: number;
  /** Opaque resume cursor (byte offset). */
  cursorByte?: number;
}

export interface NativeLogSearchResult {
  matches: NativeLogSearchMatch[];
  nextCursorByte: number | null;
  hasMore: boolean;
  truncated: boolean;
}

export interface NativeLogFindAtTimeInput {
  sessionId: string;
  /** ISO timestamp or HH:mm[:ss] fragment. */
  target: string;
}

export interface NativeLogFindAtTimeResult {
  lineNumber: number | null;
  found: boolean;
}

export interface NativeLogsApi {
  open(input: NativeLogOpenInput): Promise<NativeLogSession>;
  close(sessionId: string): Promise<void>;
  readWindow(input: NativeLogWindowInput): Promise<LogWindow>;
  getSession(sessionId: string): Promise<LogSessionInfo>;
  /** Pause/resume kube follow append (2.2b). Optional for in-memory engines. */
  setPaused?(sessionId: string, paused: boolean): Promise<LogSessionInfo>;
  /** Full-file search (ripgrep crates). Returns line/offset only. */
  search?(input: NativeLogSearchInput): Promise<NativeLogSearchResult>;
  cancelSearch?(sessionId: string): Promise<void>;
  findLineAtTime?(input: NativeLogFindAtTimeInput): Promise<NativeLogFindAtTimeResult>;
}

export interface NativeTerminalOpenInput {
  provider: string;
  target: Record<string, string>;
}

export interface NativeTerminalSession {
  sessionId: string;
}

export interface NativeTerminalApi {
  open(input: NativeTerminalOpenInput): Promise<NativeTerminalSession>;
}

export interface NativeStreamsApi {
  /** Placeholder for high-throughput stream handles. */
  close(streamId: string): Promise<void>;
}

export interface NativeCompressionApi {
  gzipFile(path: string): Promise<string>;
}

export interface NativeDiagnosticsHealth {
  status: string;
  phase: string;
  kubernetesConnected: boolean;
  lastAbnormalExit: boolean;
  logDir: string;
}

/** App diagnostics already owned by Rust — pilot bridge for ctx.native. */
export interface NativeDiagnosticsApi {
  health(): Promise<NativeDiagnosticsHealth>;
}

export interface NativeApi {
  readonly process: NativeProcessApi;
  readonly fs: NativeFsApi;
  readonly credentials: NativeCredentialsApi;
  readonly logs: NativeLogsApi;
  readonly terminal: NativeTerminalApi;
  readonly streams: NativeStreamsApi;
  readonly compression: NativeCompressionApi;
  readonly diagnostics: NativeDiagnosticsApi;
  /** Cluster client accelerator (ADR 0004) — not a Core business service. */
  readonly kubernetes: NativeKubernetesApi;
  /** Docker Engine accelerator — V1 stub until socket bridge lands. */
  readonly docker: NativeDockerApi;
  /** Local/remote Git accelerator — V1 stub. */
  readonly git: NativeGitApi;
  /** SSH session accelerator — V1 stub; never arbitrary host shell. */
  readonly ssh: NativeSshApi;
  /** Jenkins controller accelerator — V1 stub. */
  readonly jenkins: NativeJenkinsApi;
  /** Argo CD API accelerator — V1 stub. */
  readonly argocd: NativeArgocdApi;
  /** Harbor registry accelerator — V1 stub. */
  readonly harbor: NativeHarborApi;
}

export interface NativeApiBridge {
  health(): Promise<NativeDiagnosticsHealth>;
  /** Optional test / host override; default uses Tauri kubernetes commands. */
  kubernetes?: NativeKubernetesApi;
  docker?: NativeDockerApi;
  git?: NativeGitApi;
  ssh?: NativeSshApi;
  jenkins?: NativeJenkinsApi;
  argocd?: NativeArgocdApi;
  harbor?: NativeHarborApi;
  logs?: NativeLogsApi;
}
