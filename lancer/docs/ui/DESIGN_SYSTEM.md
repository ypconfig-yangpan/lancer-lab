# DevOps Desktop — Design System

## 1. Visual Direction

Primary inspirations:

- OrbStack: simplicity, speed perception, desktop-native feel
- JetBrains / VS Code: workspace, panels, tabs and keyboard workflow
- Linear: visual restraint and interaction polish

The product must NOT visually resemble a generic SaaS admin template.

## 2. Technology

**锁定见 [ADR 0002](../adr/0002-react-ui-stack.md)。**

```text
Tailwind CSS 4 → Radix → shadcn(零件) → @lancer/ui → Shell/Plugins
TanStack Table + Virtual · react-resizable-panels · Monaco · xterm
```

- shadcn/ui = 复制改造起点，**不是**产品 Design System
- `@lancer/ui` = 真正的 DS（`src/ui`）
- Do **not** add Ant Design, Material UI, Chakra, Mantine or another full UI framework without ADR

## 3. Design Principles

1. Information before decoration.
2. Compact before spacious.
3. Context must always remain visible.
4. Status must be readable without relying only on color.
5. Advanced capability should exist without overwhelming normal users.
6. Keyboard and pointer workflows must both be first-class.
7. Long-running tools such as Logs and Terminal must feel stable for hours.

## 4. Theme

Support:

- System
- Dark
- Light

Default design review should prioritize Dark mode because the product is intended for long technical sessions.

## 5. Color Tokens

All colors must use semantic design tokens.

Required semantic groups:

```text
surface.background
surface.panel
surface.elevated
surface.hover
surface.selected

border.default
border.strong

text.primary
text.secondary
text.muted
text.disabled

accent.default
accent.hover

status.success
status.warning
status.error
status.info
status.pending
status.running
status.terminated
status.unknown
```

Never scatter raw hex values through feature components.

## 6. Environment Tokens

Define environment semantics:

- local
- dev
- test
- staging
- prod

Production should use a restrained but persistent warning indicator.

Do NOT paint the entire UI red.

## 7. Typography

Use a modern system UI font stack for general interface text.

Use monospaced font for:

- logs
- terminal
- YAML
- resource IDs
- image tags where helpful

Typography hierarchy should remain compact.

Recommended conceptual levels:

- Page / Entity title
- Section title
- Standard text
- Secondary text
- Metadata
- Mono technical text

Avoid oversized marketing typography.

## 8. Spacing

Use a small predictable spacing scale.

Compact density is the default.

Prefer smaller vertical spacing in:

- tables
- toolbars
- tabs
- inspectors
- metadata rows

Do not use large card padding for routine operational data.

## 9. Radius

Use restrained radius.

Controls may be mildly rounded.

Panels should generally be defined by borders and hierarchy rather than large floating rounded cards.

## 10. Shadows

Use shadows sparingly.

Appropriate:

- command palette
- popover
- context menu
- dialog

Avoid shadowing every panel or card.

## 11. Icons

Use Lucide consistently.

Create semantic resource icon mappings for:

- Application
- Cluster
- Namespace
- Deployment
- Pod
- Service
- Ingress
- ConfigMap
- Secret
- Storage
- Logs
- Terminal
- Events
- Operations

Do not mix icon families without a concrete reason.

## 12. Status Components

Provide standard components:

- StatusDot
- StatusBadge
- HealthSummary
- EnvironmentBadge

Canonical statuses:

- Healthy
- Running
- Pending
- Warning
- Failed
- Terminated
- Unknown

Every status must include text/icon semantics, not color alone.

## 13. Table System

Tables are a core surface.

Standard capabilities:

- sorting
- filtering
- column visibility
- column resizing
- row selection
- keyboard navigation
- dense rows
- sticky headers where useful

Tables should support an Inspector instead of opening a full page for every minor inspection.

## 14. Form System

Forms should be compact and context-aware.

Dangerous operations must show:

- target cluster
- namespace
- resource
- before / after values when applicable

## 15. Loading States

Use:

- inline progress
- subtle skeletons on first load
- previous data during refresh

Avoid full-page spinners during routine refetches.

## 16. Empty States

Empty states should explain the next useful action.

Example:

```text
No Pods found in namespace iam-test.

[Refresh] [Change Namespace]
```

Avoid decorative empty illustrations that consume large space.

## 17. Error States

Errors must distinguish:

- permission denied
- connection failure
- resource missing
- stale data
- operation failed

Provide technical detail copy/export where appropriate.

## 18. Logs Visual Language

Logs should prioritize readability.

Required concepts:

- timestamps
- source Pod
- source container
- level
- message
- selected row
- search hit

Do not over-color entire log rows.

Use subtle level indicators and focused search highlighting.

## 19. Terminal

Terminal styling should remain close to user expectations from standard developer terminals.

Do not wrap it in excessive visual chrome.

## 20. Design System Components

The project should own stable wrappers for:

- Button
- Input
- Select
- Dialog
- ConfirmDialog
- DataTable
- Tabs
- Toolbar
- Panel
- InspectorSection
- StatusBadge
- EnvironmentBadge
- EmptyState
- ErrorState
- LoadingState
- ResourceIcon
- SplitView
- CodeViewer

Business features should use these instead of composing low-level primitives differently each time.
