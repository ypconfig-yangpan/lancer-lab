/**
 * @deprecated import from `@/shell` — hosts moved to ModuleHost / ViewHost.
 */
export {
  InspectorHost as PluginInspectorHost,
  ModuleErrorBoundary as PluginErrorBoundary,
  ModuleHost as PluginRuntimeProvider,
  SlotHost as PluginSlotHost,
  StatusItemHost as PluginStatusItemHost,
  ViewHost as PluginViewHost,
  useActivities,
  useCommands,
  useInspectorSections,
  useModuleHost as usePluginRuntime,
  useModuleState as usePluginState,
  useSlotContributions,
  useStatusBarItems,
  useViewResolver,
  useViews,
} from "@/shell";

/** @deprecated modules activate at boot */
export function useEnsurePluginActive() {
  return async (_moduleId: string) => undefined;
}
