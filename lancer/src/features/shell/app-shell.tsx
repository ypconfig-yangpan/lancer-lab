import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useShellFacade } from "@/app/facades/shell-facade-provider";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/features/command-palette/command-palette";
import { AppSidebar } from "@/features/shell/app-sidebar";
import { PanelErrorBoundary } from "@/features/shell/panel-error-boundary";
import { StatusBar } from "@/features/shell/status-bar";
import { useAbnormalExitNotice } from "@/features/shell/use-abnormal-exit-notice";
import { ViewHost } from "@/shell";
import { useTabsStore } from "@/shared/stores/tabs-store";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";

/**
 * Dashboard product shell — narrow sidebar + full-width main (SHELL_FREEZE 2026-09-30).
 * No Inspector / Bottom Dock on the default path.
 */
export function AppShell() {
  const { t } = useTranslation();
  const crashFallback = t("error.panelCrash");
  const abnormalExit = useAbnormalExitNotice();
  const openTabs = useTabsStore((s) => s.openTabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const clearTabsForModule = useTabsStore((s) => s.clearTabsForModule);
  const openWorkspaceTab = useTabsStore((s) => s.openWorkspaceTab);
  const setActiveActivityId = useWorkspaceStore((s) => s.setActiveActivityId);
  const activeActivityId = useWorkspaceStore((s) => s.activeActivityId);
  const shell = useShellFacade();

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) ?? openTabs[0] ?? null;

  const activeModuleId =
    shell.platform.activities.list().find((a) => a.id === activeActivityId)?.moduleId ?? null;

  const searchPlaceholder =
    activeModuleId === "docker"
      ? "Search containers, images…"
      : activeModuleId === "jenkins"
        ? "Search jobs, builds…"
        : activeModuleId === "kubernetes"
          ? "Search Kubernetes resources…"
          : "Search anything…";

  useEffect(() => {
    return shell.onHostEvent((event, moduleId) => {
      if (event === "module.deactivating" || event === "module.deactivated") {
        const owned = shell.platform.activities.listByModule(moduleId);
        const activeId = useWorkspaceStore.getState().activeActivityId;
        if (owned.some((a) => a.id === activeId)) {
          useWorkspaceStore.getState().setActiveActivityId(null);
        }
        clearTabsForModule(moduleId);
      }
    });
  }, [shell, clearTabsForModule]);

  // Auto-open Kubernetes on first paint when nothing selected.
  useEffect(() => {
    if (activeActivityId !== null) {
      return;
    }
    const k8s = shell.platform.activities.list().find((a) => a.moduleId === "kubernetes");
    if (!k8s) {
      return;
    }
    setActiveActivityId(k8s.id);
    const primary = shell.platform.views
      .listByLocation("workspace")
      .find((v) => v.moduleId === "kubernetes");
    if (primary) {
      openWorkspaceTab(
        {
          id: `kubernetes:${primary.id}`,
          viewId: primary.id,
          moduleId: "kubernetes",
          title: primary.title,
        },
        "pinned",
      );
    }
  }, [activeActivityId, shell, setActiveActivityId, openWorkspaceTab]);

  return (
    <PanelErrorBoundary name="workspace" fallback={crashFallback}>
      <div className="flex h-full flex-col bg-[#f5f7fa]">
        {abnormalExit.isVisible ? (
          <div className="flex items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-3 py-1.5 text-xs">
            <span>
              {t("error.abnormalExit")}
              {abnormalExit.logDir ? ` · ${abnormalExit.logDir}` : ""}
            </span>
            <Button variant="outline" onClick={abnormalExit.acknowledge}>
              {t("error.abnormalExitAck")}
            </Button>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle bg-white px-5">
              <div className="min-w-0 text-[14px] font-semibold text-foreground">
                {activeTab?.title ?? t("app.title")}
              </div>
              <button
                type="button"
                className="ml-auto flex h-9 w-[min(360px,40vw)] items-center rounded-full border border-border-subtle bg-[#f5f7fa] px-4 text-left text-[13px] text-muted-foreground transition-colors hover:bg-surface-hover"
                onClick={() => useWorkspaceStore.getState().setCommandPaletteOpen(true)}
              >
                {searchPlaceholder}
                <span className="ml-auto text-[11px] opacity-60">⌘K</span>
              </button>
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">
                Y
              </div>
            </header>
            <main className="min-h-0 flex-1 overflow-auto bg-[#f5f7fa]">
              <PanelErrorBoundary name="workspace-view" fallback={crashFallback}>
                {activeTab ? (
                  <ViewHost
                    viewId={activeTab.viewId}
                    {...(activeTab.params !== undefined ? { params: activeTab.params } : {})}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                    {t("workspace.selectActivity")}
                  </div>
                )}
              </PanelErrorBoundary>
            </main>
          </div>
        </div>

        <CommandPalette />
        <StatusBar />
      </div>
    </PanelErrorBoundary>
  );
}
