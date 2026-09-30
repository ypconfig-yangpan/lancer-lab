import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export function PropertyList({
  items,
  className,
}: {
  items: { label: string; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("space-y-2 text-[13px]", className)}>
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[100px_1fr] gap-2">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-all text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InspectorSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "border-b border-border-subtle px-3 py-3 last:border-b-0",
        className,
      )}
    >
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
