# DevOps Desktop — UI Reference Guide

## 1. Purpose

This document defines what to learn from reference products and what not to copy.

The goal is not visual imitation. The goal is to extract product principles.

## 2. OrbStack — Primary Desktop Reference

Reference OrbStack for:

- lightweight desktop feel
- fast perceived performance
- restrained navigation
- native-app interaction feel
- low cognitive overhead
- context-first operations
- direct access to logs / terminal / files
- avoiding heavy admin-dashboard aesthetics

Do not copy OrbStack literally because DevOps Desktop is a remote operations workspace rather than a local container runtime.

### Principle to borrow

Hide implementation complexity while preserving expert escape hatches.

For DevOps Desktop:

```text
Application
  ↓
Runtime / Logs / Releases
  ↓
Advanced Resources
  ↓
Raw Kubernetes YAML
```

## 3. JetBrains IDEs — Workspace Reference

Reference JetBrains for:

- persistent tool windows
- compact high-density layout
- tabs
- inspectors
- bottom tool panels
- keyboard workflow
- long-session usability

Do not copy the full complexity of an IDE docking engine in V1.

## 4. VS Code — Navigation and Tooling Reference

Reference VS Code for:

- Activity Bar
- Explorer
- Editor Tabs
- Bottom Panel
- Status Bar
- Command Palette
- Quick Open

V1 should adopt the mental model, not rebuild the entire extension/docking architecture.

## 5. Linear — Visual Restraint Reference

Reference Linear for:

- typography hierarchy
- restrained color
- interaction polish
- compact controls
- subtle selected / hover states

Do not turn the product into a project-management visual clone.

## 6. Rancher / Kuboard — Kubernetes Completeness Reference

Reference them for:

- resource coverage
- Kubernetes terminology accuracy
- advanced resource operations
- permissions and cluster-level concepts

Do NOT use them as the primary visual/navigation reference.

The default DevOps Desktop workflow should not require users to start with Kubernetes Kind navigation.

## 7. Argo CD — GitOps Reference

Future reference for:

- desired state vs live state
- sync health
- diff
- revision history
- rollback concepts

GitOps is future scope and must not distort V1 UI.

## 8. Devtron — Delivery Workflow Reference

Reference for future:

- CI/CD workflow visualization
- application delivery
- release history
- deployment lifecycle

Do not reproduce its entire platform information architecture in V1.

## 9. Product Design Formula

The UI direction can be summarized as:

> OrbStack-level simplicity + IDE-level information density + Kubernetes-level power.

Secondary formula:

> Application-first for normal users, resource-first only for experts.

## 10. Visual Anti-reference

Avoid generic admin template patterns:

- huge KPI cards
- excessive shadows
- large rounded panels everywhere
- decorative gradients
- oversized headers
- dashboard-first navigation
- sidebar with every Kubernetes Kind visible

## 11. Cursor / AI Design Rule

When generating UI, do not default to a generic shadcn dashboard.

Before implementing a screen, determine:

1. Which Shell region owns it?
2. Which Page Template is used?
3. What is the primary user task?
4. Which context must remain visible?
5. Does the action belong in Workspace, Inspector, Bottom Panel, or Context Menu?
6. Is Kubernetes detail necessary for the default user?

## 12. Review Checklist

A UI proposal fails review if:

- it looks like a standard SaaS dashboard
- it introduces a new layout pattern without need
- it hides current cluster/environment context
- it turns logs into a small textarea
- it requires deep navigation for frequent actions
- it exposes Kubernetes internals before Application concepts
- it increases density by making information visually chaotic
- it sacrifices performance for decorative UI
