import type { AppSubsystem } from "@/app/lancer-app";
import { logger } from "@/shared/logger";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";

/**
 * Persists shell chrome that survives process exit.
 * Theme is already written on each setTheme; stop() is the ordered flush point
 * for future tab/layout persistence.
 */
export class WorkspaceChromeSubsystem implements AppSubsystem {
  readonly id = "workspace-chrome";

  async stop(): Promise<void> {
    const theme = useWorkspaceStore.getState().theme;
    try {
      window.localStorage.setItem("lancer.theme", theme);
    } catch (error) {
      logger.warn("failed to persist workspace chrome", { error: String(error) });
    }
  }
}
