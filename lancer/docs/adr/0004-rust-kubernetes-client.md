# ADR 0004: Rust Kubernetes Client

## Context

Desktop 直连 Cluster，需要可靠的 K8s API 客户端、类型与 watch/stream 能力。

## Decision

采用 **kube-rs + k8s-openapi**。自建 Port：`ClusterClient` 与 Query/Gateway（pod/deployment/service/event/log_stream/exec_session）。UI 只消费自有 DTO（如 `PodSummary`）。

禁止自研 Kubernetes REST Client；禁止业务代码到处直接调 `kube::Client`。K8s 远端资源 Port 命名为 Query / Gateway / Client，避免一律 `Repository`。

## Alternatives

- 手写 REST：重复造轮子，易在 auth/watch/stream 上出错。
- 通过中心 Server 代理：违背第一阶段无 Server 目标。

## Consequences

- infrastructure/kubernetes 经 `ClusterClientRegistry`，业务不直接持有 `kube::Client`。
- 列表/详情默认精简 DTO；Raw YAML 按需。
- **2026-09-01：** kube 0.98 已接入 Phase 1 Read（connect / namespaces / pods）。Mock 仍可用于无集群的 UI 开发。
- **2026-09-02（[ADR 0013](./0013-typescript-first-plugin.md)）：** 本 ADR 描述的是 **Native Capability**（直连、watch、吞吐敏感路径），不是「Kubernetes 插件必须整包用 Rust Backend」。普通 list/get/mapping / orchestration 允许 Extension TypeScript；大日志、高吞吐 stream、凭证与进程边界仍优先 Rust。
