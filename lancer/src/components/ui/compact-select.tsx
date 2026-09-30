import { ChevronDown } from "lucide-react";
import type { ChangeEventHandler, SelectHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

type CompactSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "size"> & {
  className?: string;
  /** Max width of the trigger, e.g. max-w-[220px] */
  triggerClassName?: string;
  /** sm = 28px (toolbar), md = 32px (page header). */
  size?: "sm" | "md";
};

/** Native select with custom chevron — product-wide dropdown style. */
export function CompactSelect({
  className,
  triggerClassName,
  size = "sm",
  children,
  ...props
}: CompactSelectProps) {
  return (
    <div className={cn("relative inline-flex min-w-0 max-w-full", className)}>
      <select
        {...props}
        className={cn(
          "min-w-0 truncate rounded-[6px] border border-border-subtle bg-white py-0 pl-2.5 pr-7",
          "text-foreground outline-none",
          size === "md" ? "h-8 text-[12px]" : "h-7 font-mono text-[11px]",
          "appearance-none [-webkit-appearance:none] [-moz-appearance:none]",
          "bg-none bg-[unset]",
          "hover:border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/15",
          "disabled:cursor-not-allowed disabled:opacity-50",
          triggerClassName,
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-slate-400"
        strokeWidth={1.75}
        aria-hidden
      />
    </div>
  );
}

export type CompactSelectChangeHandler = ChangeEventHandler<HTMLSelectElement>;
