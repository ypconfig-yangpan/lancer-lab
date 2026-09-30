import type { PluginContext } from "@/plugin-kernel/context";
import type { ActivityDescriptor } from "@/plugin-kernel/types";

/**
 * Module activation context.
 * Structurally compatible with PluginContext (Wave2 still shares factory).
 * No apply.
 */
export type ModuleContext = PluginContext;

export type ActivityContribution = Omit<ActivityDescriptor, "moduleId">;

/** Built-in Shell module — static import + activate once at app start. */
export interface ShellModule {
  readonly moduleId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly activities?: readonly ActivityContribution[];
  activate(context: ModuleContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface ShellModuleEntry {
  readonly module: ShellModule;
  readonly context: ModuleContext;
  readonly active: boolean;
}
