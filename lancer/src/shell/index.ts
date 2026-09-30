export type {
  ActivityContribution,
  ModuleContext,
  ShellModule,
  ShellModuleEntry,
} from "./types";
export { ShellModuleRegistry } from "./module-registry";
export {
  InspectorHost,
  ModuleErrorBoundary,
  ModuleHost,
  SlotHost,
  StatusItemHost,
  useActivities,
  useCommands,
  useInspectorSections,
  useModuleHost,
  useModuleState,
  useSlotContributions,
  useStatusBarItems,
  useViewResolver,
  useViews,
  ViewHost,
  type ShellHostRuntime,
} from "./module-host";
export {
  useInspectorChromeStore,
  useModuleSelectionStore,
  useReportInspectorSelection,
  ModuleHostIdProvider,
  useHostModuleId,
} from "./presentation/index";
export { PlatformServices } from "@/plugin-kernel/platform/services";
