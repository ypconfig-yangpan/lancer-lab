import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { createDesktopApp, type DesktopApp } from "@/app/create-desktop-app";
import type { ShellFacade } from "@/app/facades/shell-facade";
import { ShellFacadeProvider } from "@/app/facades/shell-facade-provider";
import { ModuleHost } from "@/shell";
import { routeTree } from "@/routeTree.gen";
import { logger } from "@/shared/logger";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";
import "@/styles/globals.css";

function ThemeSync() {
  const theme = useWorkspaceStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const prefersDark = media.matches;
      const dark = theme === "dark" || (theme === "system" && prefersDark);
      root.classList.toggle("dark", dark);
    };

    apply();
    if (theme === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
    return undefined;
  }, [theme]);

  return null;
}

function AppView({
  shellFacade,
  router,
}: {
  shellFacade: ShellFacade;
  router: ReturnType<typeof createAppRouter>;
}) {
  return (
    <ShellFacadeProvider facade={shellFacade}>
      <ModuleHost runtime={shellFacade.runtimeForHosts}>
        <ThemeSync />
        <RouterProvider router={router} />
        <Toaster richColors position="bottom-right" closeButton />
      </ModuleHost>
    </ShellFacadeProvider>
  );
}

function createAppRouter(queryClient: DesktopApp["queryClient"]) {
  return createRouter({
    routeTree,
    context: {
      queryClient,
    },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

async function bindWindowClose(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const current = getCurrentWindow();
    // 关窗 = 隐藏，进程保留（和常见桌面应用一致）；真正退出走菜单「退出」
    await current.onCloseRequested(async (event) => {
      event.preventDefault();
      await current.hide();
    });
  } catch {
    // 非 Tauri 环境忽略
  }
}

async function boot(): Promise<void> {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("root element missing");
  }

  const desktop = createDesktopApp();
  await desktop.app.start();

  const router = createAppRouter(desktop.queryClient);

  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={desktop.queryClient}>
        <AppView shellFacade={desktop.shellFacade} router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );

  desktop.app.markRunning();
  await bindWindowClose();
  logger.operation("app running");
}

void boot().catch((error: unknown) => {
  console.error("Lancer failed to start", error);
  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.textContent = `Lancer failed to start: ${String(error)}`;
  }
});
