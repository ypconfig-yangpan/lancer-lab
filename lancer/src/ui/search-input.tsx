import type { InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

export function SearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="search"
      className={cn(
        "h-8 w-full rounded-[7px] border border-border-subtle bg-surface-2 px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground outline-none transition-[border-color,background-color] duration-[var(--transition-fast)] focus:border-ring/50 focus:bg-surface-1",
        className,
      )}
      {...props}
    />
  );
}
