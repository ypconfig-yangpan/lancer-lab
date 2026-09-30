import i18n from "i18next";
import type { AppSubsystem } from "@/app/lancer-app";

/**
 * Ensures translations are initialized before first paint (no raw keys
 * flashing). Resources register via the "@/shared/i18n" side-effect import
 * in the composition root.
 */
export class I18nSubsystem implements AppSubsystem {
  readonly id = "i18n";

  async start(): Promise<void> {
    if (i18n.isInitialized) {
      return;
    }
    await new Promise<void>((resolve) => {
      i18n.on("initialized", () => resolve());
    });
  }

  async stop(): Promise<void> {
    // i18next has no shutdown; nothing to release.
  }
}
