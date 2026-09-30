import type { ComponentType, ReactNode } from "react";

export type PluginState =
  | "discovered"
  | "installed"
  | "resolved"
  | "loading"
  | "initialized"
  | "activating"
  | "active"
  | "deactivating"
  | "inactive"
  | "unloading"
  | "unloaded"
  | "failed";

export type PluginDeactivateReason =
  | "user-disable"
  | "uninstall"
  | "host-shutdown"
  | "dependency-lost"
  | "failure"
  | "reload";

export type ViewLocation = "workspace" | "explorer" | "inspector" | "bottomPanel";

export type ActivationEvent =
  | "onStartupFinished"
  | `onActivity:${string}`
  | `onView:${string}`
  | `onCommand:${string}`
  | `onApplicationSection:${string}`;

export interface PluginDependency {
  moduleId: string;
  version: string;
  optional?: boolean;
}

export interface PluginManifestContributionActivity {
  id: string;
  title: string;
  /** Short subtitle for Activity Bar tooltip. */
  description?: string;
  icon?: string;
  order?: number;
}

export interface PluginManifestContributes {
  activities?: PluginManifestContributionActivity[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  publisher: string;
  /** Product classification (ADR 0015). Runtime treats all the same. */
  category?: "provider" | "experience" | "platform";
  frontend?: {
    entry: string;
  };
  backend?: {
    type: "builtin" | "external";
  };
  activationEvents?: ActivationEvent[];
  contributes?: PluginManifestContributes;
  dependencies?: PluginDependency[];
}

export interface PluginRequestContext {
  clusterId?: string;
  namespace?: string;
  signal?: AbortSignal;
}

export interface PluginRequest {
  requestId: string;
  type: string;
  payload?: unknown;
  context?: PluginRequestContext;
}

export interface PluginResponse {
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface PluginLifecycleContext {
  readonly state: PluginState;
  readonly abortSignal: AbortSignal;
}

export interface CommandDescriptor {
  id: string;
  title: string;
  moduleId: string;
  category?: string;
  when?: string;
  execute: (args?: unknown) => Promise<void> | void;
}

export type ViewFactory = (props: { params?: unknown }) => ReactNode;

export interface ViewDescriptor {
  id: string;
  moduleId: string;
  title: string;
  location: ViewLocation;
  factory: ViewFactory;
}

export interface SlotDescriptor {
  id: string;
  moduleId: string;
  slotId: string;
  factory: ViewFactory;
  order?: number;
}

export interface ActivityDescriptor {
  id: string;
  moduleId: string;
  title: string;
  description?: string;
  icon?: string;
  order?: number;
}

export interface InspectorSectionDescriptor {
  id: string;
  moduleId: string;
  title: string;
  factory: ViewFactory;
  order?: number;
}

export interface StatusBarItemDescriptor {
  id: string;
  moduleId: string;
  order?: number;
  factory: ViewFactory;
}

export interface WorkspaceTab {
  id: string;
  viewId: string;
  moduleId: string;
  title: string;
  params?: unknown;
  /** false = preview (single-click, replaced by next preview); true = pinned. */
  pinned: boolean;
}

export interface SessionCreateOptions {
  type: string;
  metadata?: Record<string, unknown>;
}

export interface PluginSession {
  readonly id: string;
  readonly moduleId: string;
  readonly type: string;
  readonly metadata: Record<string, unknown>;
  close(): Promise<void>;
}

export interface OperationCreateOptions {
  type: string;
  title: string;
  metadata?: Record<string, unknown>;
}

export interface PluginOperation {
  readonly id: string;
  readonly moduleId: string;
  readonly type: string;
  readonly title: string;
  cancel(): Promise<void>;
}

/** @deprecated Plugin programming model removed — use ShellModule + capabilities. */
export type DevOpsPlugin = never;
export type PluginModule = never;

export type HostLifecycleEvent =
  | "plugin.discovered"
  | "plugin.loading"
  | "plugin.activated"
  | "plugin.deactivating"
  | "plugin.deactivated"
  | "plugin.failed"
  | "plugin.unloaded";

export type PluginComponent = ComponentType<{ params?: unknown }>;
