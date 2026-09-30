import { createContext, useContext } from "react";

const ModuleHostIdContext = createContext<string | null>(null);

export const ModuleHostIdProvider = ModuleHostIdContext.Provider;

/** moduleId of the enclosing ViewHost / InspectorHost. */
export function useHostModuleId(): string | null {
  return useContext(ModuleHostIdContext);
}

/** @deprecated use useHostModuleId */
export const useHostPluginId = useHostModuleId;
/** @deprecated use ModuleHostIdProvider */
export const PluginHostPluginIdProvider = ModuleHostIdProvider;
