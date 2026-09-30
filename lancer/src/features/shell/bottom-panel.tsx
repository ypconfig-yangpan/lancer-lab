import { ChevronsDownUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@lancer/ui";
import { useViews, ViewHost } from "@/shell";
import { cn } from "@/shared/lib/utils";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";

type CoreBottomTab = "terminal";

interface BottomPanelProps {
  onHeaderDoubleClick?: () => void;
  onCollapseClick?: () => void;
}

/** Bottom dock: module Logs/Events/Exec tabs + core Terminal (LAYOUT_SYSTEM). */
export function BottomPanel({ onHeaderDoubleClick, onCollapseClick }: BottomPanelProps) {
  const { t } = useTranslation();
  const bottomTab = useWorkspaceStore((s) => s.bottomTab);
  const setBottomTab = useWorkspaceStore((s) => s.setBottomTab);
  const moduleBottomViews = useViews("bottomPanel");
  const activeBottomViewId = useWorkspaceStore((s) => s.activeBottomViewId);
  const setActiveBottomViewId = useWorkspaceStore((s) => s.setActiveBottomViewId);

  const coreTabs: CoreBottomTab[] = ["terminal"];
  const showingCore = activeBottomViewId === null;

  return (
    <div className="flex h-full flex-col bg-surface-1 shadow-[inset_0_1px_0_0_var(--border-subtle)]">
      <div
        className="flex items-center gap-1 px-2 py-1"
        onDoubleClick={onHeaderDoubleClick}
      >
        {moduleBottomViews.map((view) => {
          const active = activeBottomViewId === view.id;
          return (
            <button
              key={view.id}
              type="button"
              className={cn(
                "relative px-2.5 py-1.5 text-[13px] transition-colors duration-[var(--transition-fast)]",
                active
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setActiveBottomViewId(view.id)}
            >
              {view.title}
              {active ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-primary" />
              ) : null}
            </button>
          );
        })}
        {coreTabs.map((tab) => {
          const active = showingCore && bottomTab === tab;
          return (
            <button
              key={tab}
              type="button"
              className={cn(
                "relative px-2.5 py-1.5 text-[13px] transition-colors duration-[var(--transition-fast)]",
                active
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                setActiveBottomViewId(null);
                setBottomTab(tab);
              }}
            >
              {t(`bottom.${tab}`)}
              {active ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t bg-primary" />
              ) : null}
            </button>
          );
        })}
        <div className="flex-1" />
        {onCollapseClick ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("bottom.collapse")}
            title={t("bottom.collapseHint")}
            onClick={(event) => {
              event.stopPropagation();
              onCollapseClick();
            }}
          >
            <ChevronsDownUp className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 border-t border-border-subtle">
        {activeBottomViewId ? (
          <ViewHost viewId={activeBottomViewId} />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
            {t(`bottom.${bottomTab}Placeholder`)}
          </div>
        )}
      </div>
    </div>
  );
}
