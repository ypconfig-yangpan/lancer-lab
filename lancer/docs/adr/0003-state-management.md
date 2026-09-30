# ADR 0003: State Management

## Context

需要区分远程事实、桌面 UI 状态、局部组件状态，避免把 K8s 数据复制进全局 store。

## Decision

- **TanStack Query**：Remote / Async（Cluster、Pod、Deployment…）+ Query Key Factory
- **Zustand**：UI / Desktop（当前 Cluster/NS、Tabs、Panel、Theme、Command Palette）
- **useState/useReducer**：局部状态
- **TanStack Router**：可分享/可恢复的位置（cluster、namespace、resource、tab）进 URL；复杂业务状态不进 Router
- Stream / 日志 / Terminal：独立 Session，不用 Query 轮询模拟
- 禁止 React Router；禁止默认引入 Redux / XState / RxJS（见 ARCHITECTURE_RULES）

## Alternatives

- Redux Toolkit：过重，易把远程数据再复制一份。
- 仅 Zustand：会重新发明 cache/retry/refresh。

## Consequences

- Query = 外部事实；Zustand = UI 状态；边界由 code review 强制。
- 表单用 React Hook Form + Zod，不进全局 store。
