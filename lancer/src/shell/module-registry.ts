import type { PluginDeactivateReason, PluginState } from "@/plugin-kernel/types";
import { PluginContextFactory } from "@/plugin-kernel/context";
import type { PlatformServices } from "@/plugin-kernel/platform/services";
import { PluginScope } from "@/plugin-kernel/scope";
import type { ModuleContext, ShellModule, ShellModuleEntry } from "./types";

interface RuntimeEntry {
  module: ShellModule;
  context: ModuleContext | null;
  scope: PluginScope | null;
  active: boolean;
}

/**
 * Static Shell module registry — replaces PluginManager.
 * Modules are activated once at start (no lazy ensureActive, no apply).
 */
export class ShellModuleRegistry {
  private readonly entries = new Map<string, RuntimeEntry>();
  private readonly contextFactory: PluginContextFactory;
  private readonly hostListeners = new Set<(event: string, moduleId: string) => void>();

  constructor(
    private readonly platform: PlatformServices,
    contextFactory: PluginContextFactory = new PluginContextFactory(),
  ) {
    this.contextFactory = contextFactory;
  }

  get platformServices(): PlatformServices {
    return this.platform;
  }

  register(module: ShellModule): void {
    if (this.entries.has(module.moduleId)) {
      throw new Error(`Shell module already registered: ${module.moduleId}`);
    }
    this.entries.set(module.moduleId, {
      module,
      context: null,
      scope: null,
      active: false,
    });
  }

  list(): ShellModule[] {
    return [...this.entries.values()].map((e) => e.module);
  }

  listEntries(): ShellModuleEntry[] {
    return [...this.entries.values()].map((e) => ({
      module: e.module,
      context: e.context as ModuleContext,
      active: e.active,
    }));
  }

  get(moduleId: string): ShellModule | undefined {
    return this.entries.get(moduleId)?.module;
  }

  isActive(moduleId: string): boolean {
    return this.entries.get(moduleId)?.active === true;
  }

  getState(moduleId: string): PluginState {
    const entry = this.entries.get(moduleId);
    if (!entry) {
      return "unloaded";
    }
    if (!entry.module.enabled) {
      return "inactive";
    }
    return entry.active ? "active" : "inactive";
  }

  onHostEvent(listener: (event: string, moduleId: string) => void): () => void {
    this.hostListeners.add(listener);
    return () => {
      this.hostListeners.delete(listener);
    };
  }

  private emit(event: string, moduleId: string): void {
    for (const listener of [...this.hostListeners]) {
      listener(event, moduleId);
    }
  }

  async activateAll(): Promise<void> {
    for (const entry of this.entries.values()) {
      if (!entry.module.enabled || entry.active) {
        continue;
      }
      await this.activateModule(entry);
    }
  }

  private async activateModule(entry: RuntimeEntry): Promise<void> {
    const { module } = entry;
    const moduleId = module.moduleId;

    this.emit("module.activating", moduleId);

    const scope = new PluginScope(moduleId);
    entry.scope = scope;
    const context = this.contextFactory.create({
      moduleId: moduleId,
      scope,
      platform: this.platform,
      getState: () => this.getState(moduleId),
    });
    entry.context = context;

    for (const activity of module.activities ?? []) {
      context.activities.register(activity);
    }

    await Promise.resolve(module.activate(context));
    entry.active = true;
    this.emit("module.activated", moduleId);
  }

  async deactivateAll(reason: PluginDeactivateReason = "host-shutdown"): Promise<void> {
    void reason;
    for (const entry of [...this.entries.values()].reverse()) {
      if (!entry.active) {
        continue;
      }
      await this.deactivateModule(entry);
    }
  }

  private async deactivateModule(entry: RuntimeEntry): Promise<void> {
    const moduleId = entry.module.moduleId;
    this.emit("module.deactivating", moduleId);
    try {
      await Promise.resolve(entry.module.deactivate?.());
    } finally {
      if (entry.scope) {
        await entry.scope.dispose();
      }
      entry.scope = null;
      entry.context = null;
      entry.active = false;
      this.emit("module.deactivated", moduleId);
    }
  }
}
