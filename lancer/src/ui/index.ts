/**
 * @lancer/ui — Lancer Design System (ADR 0002).
 *
 * Import: `import { Button, PageHeader } from "@lancer/ui"`
 * Alias: `@devops-desktop/ui` → same entry.
 *
 * shadcn/Radix = parts supplier (src/components/ui). This package = product DS.
 * Plugins MUST NOT use Ant Design / MUI / per-plugin CSS frameworks.
 */

export { Badge } from "@/components/ui/badge";
export { Button } from "@/components/ui/button";
export { DataTableFrame, dataTableRowClass } from "./data-table";
export { InspectorSection, PropertyList } from "./inspector";
export { PageHeader } from "./page-header";
export { PageTabs, type PageTabItem } from "./page-tabs";
export { SearchInput } from "./search-input";
export { StatusBadge, type StatusTone } from "./status-badge";
