import { useTranslation } from "react-i18next";
import { StatusItemHost, useStatusBarItems } from "@/shell";

/**
 * Core StatusBar: layout host only.
 * Module contributions: order < 50 → left; order >= 50 → right (before idle).
 */
export function StatusBar() {
  const { t } = useTranslation();
  const moduleItems = useStatusBarItems();
  const leftItems = moduleItems.filter((item) => (item.order ?? 0) < 50);
  const rightItems = moduleItems.filter((item) => (item.order ?? 0) >= 50);

  return (
    <footer
      className="flex h-[var(--statusbar-height)] shrink-0 items-center gap-3 bg-surface-2 px-3 font-mono text-[11px] text-muted-foreground shadow-[inset_0_1px_0_0_var(--border-subtle)]"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {leftItems.map((item) => (
          <StatusItemHost key={item.id} item={item} />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {rightItems.map((item) => (
          <StatusItemHost key={item.id} item={item} />
        ))}
        <span className="shrink-0">Mock data</span>
        <span className="shrink-0">{t("status.taskIdle")}</span>
        <span className="shrink-0">Lancer v0.1.0</span>
      </div>
    </footer>
  );
}
