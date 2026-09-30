import { useEffect, useState } from "react";
import { logger } from "@/shared/logger";
import { appApi } from "@/shared/tauri";

export function useAbnormalExitNotice(): {
  isVisible: boolean;
  logDir: string;
  acknowledge: () => void;
} {
  const [isVisible, setIsVisible] = useState(false);
  const [logDir, setLogDir] = useState("");

  useEffect(() => {
    let cancelled = false;
    void appApi
      .health()
      .then((health) => {
        if (!cancelled) {
          setIsVisible(health.lastAbnormalExit);
          setLogDir(health.logDir);
        }
      })
      .catch(() => {
        logger.error("failed to read application health");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function acknowledge(): void {
    void appApi.ackAbnormalExit().then(() => {
      setIsVisible(false);
    });
  }

  return { isVisible, logDir, acknowledge };
}
