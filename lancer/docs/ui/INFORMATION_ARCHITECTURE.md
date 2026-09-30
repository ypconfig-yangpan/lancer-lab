# DevOps Desktop — Information Architecture

> **产品原则以 [PRODUCT_MODEL.md](../PRODUCT_MODEL.md) 为准：先集成，后抽象；Connections → 工具工作区。**  
> 下文若仍写 Application 默认导航，属历史草稿；实现前以 Product Model 为准。

## 1. Product Positioning

DevOps Desktop is not a traditional Web Admin dashboard and not a Kubernetes resource browser.

The primary mental model is:

- Workspace
- Application
- Environment
- Release
- Runtime
- Logs
- Operations

Kubernetes resources are an advanced implementation view, not the default product navigation model.

Design target:

> OrbStack-level simplicity, IDE-level information density, Kubernetes-level power.

## 2. Primary Navigation

The first-level navigation MUST stay compact.

1. Applications
2. Clusters
3. Resources
4. Logs
5. Operations
6. Templates (future)
7. Settings

Do not expose every Kubernetes Kind at the first navigation level.

## 3. Applications

Applications is the default daily workspace.

Example hierarchy:

```text
Applications
├── IAM
│   ├── DEV
│   ├── TEST
│   └── PROD
├── Workflow
└── Data
```

An Application page should answer these questions first:

- Is it healthy?
- What version is running?
- How many instances are ready?
- What image is deployed?
- Which endpoint is exposed?
- What changed recently?
- Can I view logs, terminal, events, releases and operations immediately?

Recommended tabs:

- Overview
- Runtime
- Releases
- Logs
- Events
- Configuration
- Operations
- Resources

## 4. Clusters

Clusters is for platform and environment awareness, not the default developer workflow.

Recommended hierarchy:

```text
Clusters
├── test-cluster
│   ├── Overview
│   ├── Namespaces
│   ├── Nodes
│   ├── Workloads
│   ├── Networking
│   └── Storage
└── prod-cluster
```

Cluster pages should clearly display risk level and connection state.

## 5. Resources

Resources is the Kubernetes expert view.

Recommended grouping:

```text
Workloads
├── Deployment
├── StatefulSet
├── DaemonSet
├── Job
└── CronJob

Network
├── Service
├── Ingress
└── Endpoint

Configuration
├── ConfigMap
├── Secret
└── ServiceAccount

Storage
├── PVC
└── PV
```

Raw resources belong here rather than dominating the default user experience.

## 6. Logs

Logs is a first-class workspace, not only a Pod sub-tab.

Log Workspace should support:

- Live streams
- Multiple Pod sources
- Local log files
- Downloaded files
- Keyword search
- Regex search
- Level filters
- Bookmarks
- Export
- Local cache

The log model must remain usable even when the original Pod no longer exists.

## 7. Operations

Operations records user actions and long-running actions.

Examples:

- Scale Deployment
- Restart workload
- Update image
- Delete Pod
- Download logs
- Export logs
- Future deploy / rollback

Unified status:

- Queued
- Running
- Succeeded
- Failed
- Cancelled

## 8. Global Context

The user should always be able to identify:

- Workspace
- Cluster
- Namespace
- Environment
- Selected Application / Resource

Dangerous actions must repeat relevant context in the confirmation UI.

## 9. Search

Global search is a first-class navigation system.

Search targets should include:

- Applications
- Clusters
- Namespaces
- Pods
- Deployments
- Services
- Commands

The user should not need to manually drill down through five layers to find a known resource.

## 10. Command Palette

`Cmd/Ctrl + K` opens Command Palette.

Examples:

```text
Switch cluster
Switch namespace
Open application
Open logs
Open terminal
Restart deployment
Scale deployment
Open settings
```

## 11. Progressive Complexity

The UI follows three levels:

### Level 1 — Application View

For daily development and operations.

### Level 2 — Advanced Runtime

Expose probes, replicas, resources, networking, configuration and runtime details.

### Level 3 — Raw Kubernetes

Expose manifests, raw YAML, low-level resources and expert controls.

## 12. Navigation Rules

MUST:

- Keep first-level navigation stable.
- Preserve context when switching panels.
- Support tabs for multiple simultaneous resources.
- Support direct opening from global search.
- Keep Kubernetes-specific complexity behind advanced views.

MUST NOT:

- Design the entire product around Kubernetes Kind navigation.
- Make Logs, Terminal or Events deep child pages that require repeated navigation.
- Hide the current environment or cluster during dangerous operations.
