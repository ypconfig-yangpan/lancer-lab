# DevOps Desktop — Layout System

## 1. Core Shell

The shell is persistent and IDE-like.

```text
┌────────────────────────────────────────────────────────────────────┐
│ Command Bar / Current connection summary / Search                  │
├──────────────────┬────────────────────────┬────────────────────────┤
│ WIDE TOOL TREE   │ MAIN WORKSPACE         │ INSPECTOR              │
│ (Capabilities)   │ Tabs + Resource tables │ Metadata / Actions     │
├──────────────────┴────────────────────────┴────────────────────────┤
│ Logs | Terminal | Events | Operations                              │
├────────────────────────────────────────────────────────────────────┤
│ Cluster | Namespace | Connection | Task Status                     │
└────────────────────────────────────────────────────────────────────┘
```

The shell MUST not be recreated per route.

**2026-09-30:** Primary nav is a **wide tool tree** (not a compact icon-only Activity Bar). See [SHELL_FREEZE.md](./SHELL_FREEZE.md).

## 2. Regions

### Wide tool sidebar

Purpose: switch primary tool domains and show that module's explorer tree.

Recommended width: ~220–320px (resizable).

Contains:

- Capability roots (Connections, Kubernetes, Docker, …)
- Expanded explorer content for the active module
- Optional connection summary (cluster / engine) — not Application/Environment entities

### Context Explorer (module body)

Purpose: hierarchy for the selected tool (rendered inside the wide sidebar).

Legacy Activity Bar icons (superseded as primary nav):

- Applications
- Clusters
- Resources
- Logs
- Operations
- Settings

### Context Explorer

Purpose: show the hierarchy relevant to the selected Activity.

Examples:

Applications explorer:

```text
IAM
├── DEV
├── TEST
└── PROD
```

Resources explorer:

```text
Workloads
Network
Configuration
Storage
```

Must be collapsible and resizable.

### Main Workspace

The primary work surface.

Must support:

- Multi-tab workflow
- Preview tab
- Fixed tab
- Tables
- Detail pages
- Logs workspace
- Raw YAML

### Inspector

Right-side contextual detail.

Use for:

- Status
- Metadata
- Labels
- CPU / memory
- selected Pod / resource details
- quick actions

The Inspector should reduce unnecessary page navigation.

### Bottom Panel

Persistent tool panel for:

- Logs
- Terminal
- Events
- Operations

Must support:

- Expand / collapse
- Resize
- Context following

`Cmd/Ctrl + J` may toggle it.

### Status Bar

Always-visible low-height status strip.

Recommended information:

- Cluster
- Namespace
- Environment risk level
- Connection status
- background task state

Production context must be visually obvious without turning the whole UI red.

## 3. V1 Docking Scope

V1 supports:

- resize
- collapse
- show / hide
- tabs

V1 MUST NOT implement:

- arbitrary drag docking
- detached floating panels
- fully custom VS Code-style layout engine

**Current code (2026-09):** Activity Bar（图标 + Active 指示）+ Context Explorer + Main Workspace（Preview/Pinned Tabs）+ Inspector（无选中自动折叠）+ Bottom Panel（默认 ~22%、可折叠/最大化）+ Status Bar.  
**Frozen:** [SHELL_FREEZE.md](./SHELL_FREEZE.md) — no structural Shell refactors.

This avoids a large implementation cost before core workflows are proven.

## 4. Tab Model

Support two tab behaviors:

### Preview Tab

Single-click resource opens temporary preview.

Opening another resource replaces it.

### Pinned Tab

Double-click or explicit pin fixes the tab.

Recommended shortcuts:

- `Cmd/Ctrl + W`: close tab
- `Cmd/Ctrl + P`: quick open
- `Cmd/Ctrl + K`: command palette

## 5. Page Templates

Most pages should use one of three templates.

### Template A — Resource List

```text
Context Header
Toolbar / Filter / Search
Data Table
Optional Inspector
```

Use for:

- Pods
- Deployments
- Services
- Namespaces

### Template B — Entity Detail

```text
Header
Compact Status Summary
Tabs
Content
```

Use for:

- Application
- Deployment
- Pod
- Cluster

### Template C — Tool Workspace

```text
Toolbar
Large working surface
Local status/footer
```

Use for:

- Logs
- Terminal
- YAML diff

## 6. Density

Default density: compact.

DevOps Desktop is a high-information-density tool.

Avoid:

- large dashboard cards
- oversized page titles
- excessive vertical whitespace
- large 16–24px card radius everywhere
- decorative hero sections

Prefer:

- rows
- panels
- compact summary blocks
- split views
- keyboard-driven interactions

## 7. Responsive Rules

This is a desktop-first application.

Minimum supported desktop viewport must be defined during Phase 0.

When space becomes limited:

1. Inspector collapses first.
2. Context Explorer can collapse.
3. Bottom Panel remains toggleable.
4. Main Workspace must always retain useful width.

Do not attempt mobile-first UI behavior.

## 8. Layout Persistence

Persist user preferences:

- panel widths
- bottom panel height
- open / closed panels
- active Activity

Restore safely after restart.

If a previous monitor/layout no longer exists, fall back to safe defaults.

## 9. Context Following

Bottom Panel should optionally follow the active resource.

Example:

1. User selects Deployment IAM.
2. Logs panel shows deployment-related Pod sources.
3. User selects Pod IAM-ABC.
4. Logs and Events context updates to IAM-ABC.

The user must be able to pin context when desired.

## 10. Layout Anti-patterns

Do not:

- build every page as independent full-screen dashboard.
- put Logs and Terminal in unrelated modal dialogs.
- make every metric a separate Card.
- create nested sidebars inside every page.
- rely on breadcrumb depth as the primary navigation method.
