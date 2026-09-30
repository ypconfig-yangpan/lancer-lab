import { useEffect } from "react";
import { useInspectorChromeStore } from "../presentation/inspector-chrome-store";

/** Report Inspector selection so Shell can auto-collapse when empty. */
export function useReportInspectorSelection(moduleId: string, hasSelection: boolean): void {
  const setHasSelection = useInspectorChromeStore((s) => s.setHasSelection);

  useEffect(() => {
    setHasSelection(moduleId, hasSelection);
    return () => {
      setHasSelection(moduleId, false);
    };
  }, [moduleId, hasSelection, setHasSelection]);
}
