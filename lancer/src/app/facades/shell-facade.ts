import type { PlatformServices } from "@/plugin-kernel/platform/services";
import type { PluginState } from "@/plugin-kernel/types";
import type { ShellRuntime } from "@/app/capability-bootstrap";
import type { ShellModuleRegistry } from "@/shell/module-registry";
import type { ShellHostRuntime } from "@/shell/module-host";

/**
 * Narrow surface for Desktop Shell / React chrome.
 * Product path: platform registries + modules. No apply / ensureActive.
 */
export interface ShellFacade {
  readonly platform: PlatformServices;
  readonly modules: ShellModuleRegistry;
  getModuleState(moduleId: string): PluginState;
  onHostEvent(listener: (event: string, moduleId: string) => void): () => void;
  readonly runtimeForHosts: ShellHostRuntime;
  listModules(): Array<{ id: string; name: string; enabled: boolean; state: PluginState }>;
}

export function createShellFacade(runtime: ShellRuntime): ShellFacade {
  return {
    platform: runtime.platform,
    modules: runtime.modules,
    runtimeForHosts: {
      platform: runtime.platform,
      modules: runtime.modules,
    },
    getModuleState(moduleId: string) {
      return runtime.modules.getState(moduleId);
    },
    onHostEvent(listener) {
      return runtime.modules.onHostEvent(listener);
    },
    listModules() {
      return runtime.modules.list().map((m) => ({
        id: m.moduleId,
        name: m.name,
        enabled: m.enabled,
        state: runtime.modules.getState(m.moduleId),
      }));
    },
  };
}
