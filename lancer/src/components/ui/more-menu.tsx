import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export type MoreMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

/**
 * Compact ⋯ overflow menu — used in tables for secondary actions.
 */
export function MoreMenu({
  items,
  align = "right",
  label = "更多操作",
}: {
  items: MoreMenuItem[];
  align?: "left" | "right";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-[6px] text-slate-500",
          "hover:bg-slate-100 hover:text-slate-800",
          open && "bg-slate-100 text-slate-800",
        )}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal className="size-4" strokeWidth={1.75} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute top-8 z-40 min-w-[140px] rounded-[8px] border border-border-subtle bg-white py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cn(
                "flex w-full px-3 py-1.5 text-left text-[12px] transition-colors",
                item.danger ? "text-destructive hover:bg-destructive/5" : "text-foreground hover:bg-slate-50",
                item.disabled && "cursor-not-allowed opacity-40",
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MoreMenuLabel({ children }: { children: ReactNode }) {
  return <span className="px-3 py-1 text-[10px] text-muted-foreground">{children}</span>;
}
