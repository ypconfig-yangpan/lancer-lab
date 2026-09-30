import type { AppSubsystem } from "@/app/lancer-app";
import { logger } from "@/shared/logger";
import { appApi } from "@/shared/tauri";

/**
 * First up, last down.
 * start(): probe IPC so later subsystems can rely on logs reaching the Rust side.
 * stop(): tell Rust the frontend shut down cleanly — watch tasks and cluster
 * connections are released there. Best effort; Rust RunEvent::Exit repeats
 * the same cleanup idempotently as the safety net.
 */
export class DiagnosticsSubsystem implements AppSubsystem {
  readonly id = "diagnostics";
  private ipcAvailable = false;

  async start(): Promise<void> {
    try {
      await appApi.health();
      this.ipcAvailable = true;
    } catch {
      this.ipcAvailable = false;
      logger.warn("IPC unavailable — running without Rust backend (browser dev mode?)");
    }
  }

  async stop(): Promise<void> {
    if (!this.ipcAvailable) {
      return;
    }
    try {
      await appApi.prepareShutdown();
    } catch (error) {
      logger.warn("prepareShutdown IPC failed", { error: String(error) });
    }
  }
}
