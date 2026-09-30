import type { QueryClient } from "@tanstack/react-query";
import { createShellFacade, type ShellFacade } from "@/app/facades/shell-facade";
import { LancerApp } from "@/app/lancer-app";
import { DiagnosticsSubsystem } from "@/app/subsystems/diagnostics-subsystem";
import { I18nSubsystem } from "@/app/subsystems/i18n-subsystem";
import { KernelSubsystem } from "@/app/subsystems/kernel-subsystem";
import { QuerySubsystem } from "@/app/subsystems/query-subsystem";
import { WorkspaceChromeSubsystem } from "@/app/subsystems/workspace-chrome-subsystem";
import "@/shared/i18n";

export interface DesktopApp {
  readonly app: LancerApp;
  /** Narrow surface for React Shell — prefer this over any runtime bag. */
  readonly shellFacade: ShellFacade;
  readonly queryClient: QueryClient;
}

/**
 * Composition Root — the only place that knows every subsystem.
 * Start order: diagnostics → i18n → query → kernel → workspace-chrome.
 * See docs/APPLICATION_LIFECYCLE.md.
 */
export function createDesktopApp(): DesktopApp {
  const query = new QuerySubsystem();
  const kernel = new KernelSubsystem(query.client);
  const app = new LancerApp()
    .use(new DiagnosticsSubsystem())
    .use(new I18nSubsystem())
    .use(query)
    .use(kernel)
    .use(new WorkspaceChromeSubsystem());

  return {
    app,
    shellFacade: createShellFacade(kernel.runtime),
    queryClient: query.client,
  };
}
