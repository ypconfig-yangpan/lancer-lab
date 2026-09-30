import { cn } from "@/shared/lib/utils";

export interface PageTabItem {
  id: string;
  label: string;
  /** Grey out — not selectable (design-spec upcoming kinds). */
  disabled?: boolean;
}

/** Plugin-internal secondary navigation (not Workspace object tabs). */
export function PageTabs({
  items,
  value,
  onChange,
  className,
}: {
  items: PageTabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "flex items-center gap-4 border-b border-border-subtle px-4",
        className,
      )}
      aria-label="Page"
    >
      {items.map((item) => {
        const active = item.id === value;
        const disabled = item.disabled === true;
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            title={disabled ? "Coming soon" : undefined}
            className={cn(
              "relative -mb-px py-2 text-[13px] transition-colors duration-[var(--transition-fast)]",
              disabled && "cursor-not-allowed text-muted-foreground/50",
              !disabled && active && "font-medium text-primary",
              !disabled && !active && "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              if (!disabled) {
                onChange(item.id);
              }
            }}
          >
            {item.label}
            {active && !disabled ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t bg-primary" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
