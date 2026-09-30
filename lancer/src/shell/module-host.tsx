import {
  Component,
  createContext,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { PlatformServices } from "@/plugin-kernel/platform/services";
import { ModuleHostIdProvider } from "@/shell/react/module-host-id";
import type {
  ActivityDescriptor,
  CommandDescriptor,
  InspectorSectionDescriptor,
  SlotDescriptor,
  StatusBarItemDescriptor,
  ViewDescriptor,
  ViewLocation,
} from "@/plugin-kernel/types";
import { logger } from "@/shared/logger";
import type { ShellModuleRegistry } from "./module-registry";

export interface ShellHostRuntime {
  readonly platform: PlatformServices;
  readonly modules: ShellModuleRegistry;
}

const ModuleHostContext = createContext<ShellHostRuntime | null>(null);

/** React host for Shell chrome — replaces PluginRuntimeProvider. */
export function ModuleHost({
  runtime,
  children,
}: {
  runtime: ShellHostRuntime;
  children: ReactNode;
}) {
  return <ModuleHostContext.Provider value={runtime}>{children}</ModuleHostContext.Provider>;
}

/** @deprecated use ModuleHost */
export const PluginRuntimeProvider = ModuleHost;

export function useModuleHost(): ShellHostRuntime {
  const runtime = useContext(ModuleHostContext);
  if (!runtime) {
    throw new Error("useModuleHost must be used within ModuleHost");
  }
  return runtime;
}

/** @deprecated use useModuleHost */
export function usePluginRuntime(): ShellHostRuntime {
  return useModuleHost();
}

const snapshotCache = new WeakMap<
  ObservableStore,
  Map<string, { version: number; snapshot: unknown }>
>();

interface ObservableStore {
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
}

function useRegistrySnapshot<T>(
  store: ObservableStore,
  cacheKey: string,
  computeSnapshot: () => T,
): T {
  return useSyncExternalStore(
    store.subscribe,
    () => {
      const version = store.getVersion();
      let byKey = snapshotCache.get(store);
      if (byKey === undefined) {
        byKey = new Map();
        snapshotCache.set(store, byKey);
      }
      const cached = byKey.get(cacheKey);
      if (cached !== undefined && cached.version === version) {
        return cached.snapshot as T;
      }
      const snapshot = computeSnapshot();
      byKey.set(cacheKey, { version, snapshot });
      return snapshot;
    },
    computeSnapshot,
  );
}

export function useActivities(): ActivityDescriptor[] {
  const { platform } = useModuleHost();
  return useRegistrySnapshot(platform.activities, "list", () => platform.activities.list());
}

export function useCommands(): CommandDescriptor[] {
  const { platform } = useModuleHost();
  return useRegistrySnapshot(platform.commands, "list", () => platform.commands.list());
}

export function useViews(location?: ViewLocation): ViewDescriptor[] {
  const { platform } = useModuleHost();
  return useRegistrySnapshot(platform.views, location ?? "all", () =>
    location ? platform.views.listByLocation(location) : platform.views.list(),
  );
}

export function useInspectorSections(): InspectorSectionDescriptor[] {
  const { platform } = useModuleHost();
  return useRegistrySnapshot(platform.inspector, "list", () => platform.inspector.list());
}

export function useStatusBarItems(): StatusBarItemDescriptor[] {
  const { platform } = useModuleHost();
  return useRegistrySnapshot(platform.statusBar, "list", () => platform.statusBar.list());
}

export function useSlotContributions(slotId: string): SlotDescriptor[] {
  const { platform } = useModuleHost();
  return useRegistrySnapshot(platform.slots, slotId, () => platform.slots.listForSlot(slotId));
}

export function useViewResolver(viewId: string | null): ViewDescriptor | undefined {
  const { platform } = useModuleHost();
  return useRegistrySnapshot(platform.views, viewId ?? "none", () =>
    viewId ? platform.views.resolve(viewId) : undefined,
  );
}

/**
 * @deprecated modules are activated at start.
 */
export function useEnsurePluginActive() {
  return useCallback(async (_moduleId: string) => {
    /* no-op: ShellModuleRegistry.activateAll() at boot */
  }, []);
}

export function useModuleState(moduleId: string) {
  const { modules } = useModuleHost();
  return useSyncExternalStore(
    (onChange) => modules.onHostEvent(() => onChange()),
    () => modules.getState(moduleId),
    () => modules.getState(moduleId),
  );
}

/** @deprecated use useModuleState */
export function usePluginState(moduleId: string) {
  return useModuleState(moduleId);
}

interface ModuleErrorBoundaryProps {
  moduleId: string;
  fallbackTitle?: string;
  onReload?: () => void;
  children: ReactNode;
}

interface ModuleErrorBoundaryState {
  error: Error | null;
}

/** Isolates module view crashes from the Desktop Shell. */
export class ModuleErrorBoundary extends Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  override state: ModuleErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(`module view crashed: ${this.props.moduleId}`, {
      message: error.message,
      componentStack: info.componentStack ?? "",
    });
  }

  private handleReload = () => {
    this.setState({ error: null });
    this.props.onReload?.();
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs">
          <p className="font-medium text-destructive">
            {this.props.fallbackTitle ?? `${this.props.moduleId} module failed.`}
          </p>
          <p className="max-w-sm text-muted-foreground">{this.state.error.message}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded border border-panel-border px-2 py-1 hover:bg-accent"
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PluginErrorBoundary({
  moduleId,
  fallbackTitle,
  onReload,
  children,
}: {
  moduleId: string;
  fallbackTitle?: string;
  onReload?: () => void;
  children: ReactNode;
}) {
  return (
    <ModuleErrorBoundary
      moduleId={moduleId}
      {...(fallbackTitle !== undefined ? { fallbackTitle } : {})}
      {...(onReload !== undefined ? { onReload } : {})}
    >
      {children}
    </ModuleErrorBoundary>
  );
}

function ownerIdOf(descriptor: { moduleId: string }): string {
  return descriptor.moduleId;
}

export function ViewHost({ viewId, params }: { viewId: string; params?: unknown }) {
  const descriptor = useViewResolver(viewId);
  const content = useMemo(() => {
    if (!descriptor) {
      return (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          View unavailable: {viewId}
        </div>
      );
    }
    return descriptor.factory({ ...(params !== undefined ? { params } : {}) });
  }, [descriptor, params, viewId]);

  if (!descriptor) {
    return content;
  }

  const moduleId = ownerIdOf(descriptor);
  return (
    <ModuleHostIdProvider value={moduleId}>
      <ModuleErrorBoundary moduleId={moduleId}>{content}</ModuleErrorBoundary>
    </ModuleHostIdProvider>
  );
}

/** @deprecated use ViewHost */
export const PluginViewHost = ViewHost;

export function InspectorHost({
  section,
  params,
}: {
  section: InspectorSectionDescriptor;
  params?: unknown;
}) {
  const moduleId = ownerIdOf(section);
  const content = useMemo(
    () => section.factory({ ...(params !== undefined ? { params } : {}) }),
    [section, params],
  );

  return (
    <ModuleHostIdProvider value={moduleId}>
      <ModuleErrorBoundary moduleId={moduleId}>{content}</ModuleErrorBoundary>
    </ModuleHostIdProvider>
  );
}

/** @deprecated use InspectorHost */
export const PluginInspectorHost = InspectorHost;

export function StatusItemHost({ item }: { item: StatusBarItemDescriptor }) {
  return (
    <ModuleErrorBoundary moduleId={ownerIdOf(item)}>{item.factory({})}</ModuleErrorBoundary>
  );
}

/** @deprecated use StatusItemHost */
export const PluginStatusItemHost = StatusItemHost;

export function SlotHost({ contribution }: { contribution: SlotDescriptor }) {
  return (
    <ModuleErrorBoundary moduleId={ownerIdOf(contribution)}>
      {contribution.factory({})}
    </ModuleErrorBoundary>
  );
}

/** @deprecated use SlotHost */
export const PluginSlotHost = SlotHost;
