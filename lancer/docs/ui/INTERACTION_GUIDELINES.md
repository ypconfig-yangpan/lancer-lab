# DevOps Desktop — Interaction Guidelines

## 1. Interaction Model

DevOps Desktop is a desktop operations tool.

The primary interaction modes are:

- keyboard
- pointer
- context menu
- command palette
- tabs
- split panels

The product must support fast repetitive workflows.

## 2. Command Palette

Shortcut:

`Cmd/Ctrl + K`

Commands are registered centrally.

Examples:

- Switch Cluster
- Switch Namespace
- Open Application
- Open Pod
- Open Logs
- Open Terminal
- Restart Deployment
- Scale Deployment
- Open Settings

Disabled commands must explain why.

## 3. Quick Open

`Cmd/Ctrl + P` should open searchable entities/resources.

Users should be able to jump directly to a known Pod or Application without navigating the explorer tree.

## 4. Tabs

Single click:

- Preview Tab

Double click / Pin:

- Persistent Tab

`Cmd/Ctrl + W`:

- Close current tab

Tabs should preserve local view state where reasonable.

## 5. Selection

Selecting an entity should update Inspector context.

Double-clicking or explicit Open should enter a detail/workspace view.

Avoid navigating away on every single table row click.

## 6. Context Menu

Appropriate actions:

Pod:

- View Logs
- Open Terminal
- View YAML
- Copy Name
- Delete

Deployment:

- Open
- Logs
- Scale
- Restart
- Update Image
- View YAML

Context menus must obey permissions.

## 7. Dangerous Actions

Dangerous actions require context-aware confirmation.

Example:

```text
Restart production deployment?

Cluster: prod-cn
Namespace: iam-prod
Deployment: iam

[Cancel] [Restart]
```

For highly destructive actions, require typing the resource name.

Examples:

- Delete Namespace
- Delete PVC
- Scale production to 0

## 8. Before / After

When an operation changes configuration, show a compact diff.

Example:

```text
Replicas
2 → 4

Memory
1Gi → 2Gi
```

## 9. Logs Interaction

Log Viewer should support:

- Follow Tail
- Pause
- Resume
- Search
- Regex
- Level filter
- Pod filter
- Container filter
- Export filtered
- Download complete log
- Open local file
- Reveal in Finder / Explorer

Search must not block scrolling.

## 10. Log Keyboard Workflow

Recommended shortcuts:

- `Cmd/Ctrl + F`: search
- `Enter`: next result
- `Shift + Enter`: previous result
- `Esc`: close search / clear focus
- Space or dedicated shortcut: Pause / Resume only if it does not conflict with focused controls

## 11. Terminal Interaction

Terminal must behave like a terminal, not a form field.

Requirements:

- focus on click
- standard terminal shortcuts
- resize PTY correctly
- clear disconnected state
- reconnect is explicit

## 12. Bottom Panel

`Cmd/Ctrl + J` toggles Bottom Panel.  
`Cmd/Ctrl + Shift + I` toggles Inspector.  
Double-click Bottom header maximizes / restores. See [SHELL_FREEZE.md](./SHELL_FREEZE.md).

Bottom Panel tabs:

- Logs
- Terminal
- Events
- Operations

Context may follow current active resource unless pinned.

## 13. Search Behavior

Search is progressive.

Global Search:

- application
- cluster
- namespace
- resources
- commands

Local Search:

- current table
- current logs
- YAML
- terminal where supported

Do not overload one search box with unclear behavior.

## 14. Refresh

Prefer:

Initial Query
+
Kubernetes Watch
+
Manual Refresh

Avoid visible page resets on background refresh.

## 15. Stale / Offline Data

Offline state must be explicit.

Example:

```text
Offline — showing data from 10:31:22
```

Never present cached data as live without indication.

## 16. Long-running Operations

Operations should expose:

- running state
- progress when measurable
- cancel when truly supported
- completion result
- failure details

Background tasks should be visible from Operations.

## 17. Notifications

Use Toast for short acknowledgement:

- copied
- connection succeeded
- export finished

Use persistent panels/dialogs for:

- permission denied
- failed deployment operation
- invalid kubeconfig
- disk full

Avoid notification spam from individual Pod events.

## 18. Dragging

V1 should minimize drag-based critical interactions.

Panel resizing may use drag.

Primary actions must remain available through buttons/menus/keyboard.

## 19. Permission UX

Where possible, check capability before presenting actions.

Use:

- hidden action when irrelevant
- disabled action + reason when useful to teach context

Do not make users repeatedly discover permissions through 403 errors.

## 20. Production Safety

In production context:

- show PROD indicator persistently
- default risky views to read-only where appropriate
- require explicit confirmation for writes
- never trigger write on single accidental keyboard action

## 21. Interaction Anti-patterns

Avoid:

- modal for every detail view
- full-page navigation for small inspections
- repeated toast errors without persistent detail
- invisible background writes
- auto-applying configuration while editing
- actions that do not show target context
