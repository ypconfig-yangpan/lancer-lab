import { useEffect, useState } from "react";
import {
  isWorkloadHot,
  subscribeWorkloadHot,
} from "@/capabilities/kubernetes/connect/workload-refresh-pace";

/** idle: steady poll; hot: right after restart/scale. */
export function useWorkloadRefetchInterval(idleMs = 1_500, hotMs = 700): number {
  const [ms, setMs] = useState(() => (isWorkloadHot() ? hotMs : idleMs));

  useEffect(() => {
    const sync = () => {
      setMs(isWorkloadHot() ? hotMs : idleMs);
    };
    sync();
    const unsub = subscribeWorkloadHot(sync);
    const timer = window.setInterval(sync, 1_000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [idleMs, hotMs]);

  return ms;
}
