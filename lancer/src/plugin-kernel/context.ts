import type { DisposableStore } from "./disposable";
import { createNativeApi, type NativeApi, type NativeApiBridge } from "@/native";
import {
  ScopedActivityRegistry,
  ScopedCommandRegistry,
  ScopedCredentialAccess,
  ScopedEventBus,
  ScopedInspectorRegistry,
  ScopedOperationManager,
  ScopedPluginStorage,
  ScopedQueryAccess,
  ScopedSessionManager,
  ScopedSlotRegistry,
  ScopedStatusBarRegistry,
  ScopedViewRegistry,
} from "./platform/scoped";
import type { PlatformServices } from "./platform/services";
import type { PluginScope } from "./scope";
import type { PluginLifecycleContext, PluginState } from "./types";

/** Module activation context (legacy name PluginContext). */
export interface PluginContext {
  readonly moduleId: string;
  readonly lifecycle: PluginLifecycleContext;
  readonly commands: ScopedCommandRegistry;
  readonly views: ScopedViewRegistry;
  readonly slots: ScopedSlotRegistry;
  readonly activities: ScopedActivityRegistry;
  readonly inspector: ScopedInspectorRegistry;
  readonly statusBar: ScopedStatusBarRegistry;
  readonly sessions: ScopedSessionManager;
  readonly operations: ScopedOperationManager;
  readonly credentials: ScopedCredentialAccess;
  readonly events: ScopedEventBus;
  readonly storage: ScopedPluginStorage;
  readonly queries: ScopedQueryAccess;
  readonly disposables: DisposableStore;
  readonly abortSignal: AbortSignal;
  /**
   * @deprecated Prefer domain capability APIs (`kubernetesApi` / `dockerApi`).
   */
  readonly native: NativeApi;
}

export interface PluginContextFactoryOptions {
  nativeBridge?: NativeApiBridge;
}

export class PluginContextFactory {
  constructor(private readonly options: PluginContextFactoryOptions = {}) {}

  create(args: {
    moduleId: string;
    scope: PluginScope;
    platform: PlatformServices;
    getState: () => PluginState;
  }): PluginContext {
    const { moduleId, scope, platform, getState } = args;
    const disposables = scope.disposables;

    const lifecycle: PluginLifecycleContext = {
      get state() {
        return getState();
      },
      abortSignal: scope.abortSignal,
    };

    const native = createNativeApi({
      pluginId: moduleId,
      ...(this.options.nativeBridge ? { bridge: this.options.nativeBridge } : {}),
    });

    return {
      moduleId,
      lifecycle,
      commands: new ScopedCommandRegistry(moduleId, platform.commands, disposables),
      views: new ScopedViewRegistry(moduleId, platform.views, disposables),
      slots: new ScopedSlotRegistry(moduleId, platform.slots, disposables),
      activities: new ScopedActivityRegistry(moduleId, platform.activities, disposables),
      inspector: new ScopedInspectorRegistry(moduleId, platform.inspector, disposables),
      statusBar: new ScopedStatusBarRegistry(moduleId, platform.statusBar, disposables),
      sessions: new ScopedSessionManager(moduleId, platform.sessions, disposables),
      operations: new ScopedOperationManager(moduleId, platform.operations, disposables),
      credentials: new ScopedCredentialAccess(moduleId),
      events: new ScopedEventBus(moduleId, platform.events, disposables),
      storage: new ScopedPluginStorage(),
      queries: new ScopedQueryAccess(moduleId, platform.queryClient),
      disposables,
      abortSignal: scope.abortSignal,
      native,
    };
  }
}
