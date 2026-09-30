# ADR 0017: Product-first Capabilities（去 Plugin 平台化）

## Status

Accepted 2026-09-29.

**Supersedes** [ADR 0015](./0015-official-first-plugin-product.md) 中「所有能力必须是 Plugin / Ecosystem-ready」的产品路线。  
[ADR 0012](./0012-plugin-runtime.md)、[0013](./0013-typescript-first-plugin.md)、[0014](./0014-plugin-view-contribution.md)、[0016](./0016-plugin-ui-placement.md) 在迁移完成前仍描述**现状代码**；新代码以本文为准。迁移清单：[V2_PLUGIN_MIGRATION_AUDIT.md](../V2_PLUGIN_MIGRATION_AUDIT.md)。

## Context

审计表明：Plugin Kernel 已耦合 K8s/Docker 等领域；真后端主要是 Kubernetes + Docker；其余 official 插件多为 mock；features ↔ official.kubernetes 双向耦合。Lancer 实际是**个人持续开发的 Desktop DevOps 产品**，不是第三方插件平台。继续扩张 Manifest / apply / PluginContext 只有成本、无生态收益。

Tauri 本身已是 WebView ↔ Rust IPC；不必再造一层「插件消息总线」。

## Decision

1. **Lancer 是产品，不是平台。** 不做 Marketplace、第三方 SDK、Sandbox、外部 ZIP。
2. **产品原则：先集成，后抽象。** 先把 K8s/Docker/Git/Jenkins 等工具接进工作区并做顺「连接→浏览→操作→日志→Exec→实时」；Application / Environment / Project 等 **不先验空造**，从真实使用再长。见 [PRODUCT_MODEL.md](../PRODUCT_MODEL.md)。
3. **四层技术架构：** Shell → Capabilities → Native → Infrastructure。禁止再扩 Plugin 业务层。
4. **Capabilities = 内建工具能力**（`capabilities/kubernetes|docker|…`），不是第三方 Plugin。
5. **Native 是唯一 TS→IPC 边界。** 新功能禁止 `shell.apply` / 新 Manifest contribution。
6. **Session 优先于空想业务实体：** LogSession / ExecSession / WatchSession。
7. **渐进迁移：** 旧 Plugin 双轨暂留；新切片只走 Capability API。
8. **无 ClusterGateway trait**；现状 `ClusterClientRegistry`。Agent 以后再议。

## Consequences

- 下一阶段价值：把已有 K8s/Docker 能力做深，而不是重画上层业务模型。
- 双轨期禁止新代码走 apply。
- 首页 / Connections 朴素入口可随 Shell 演进；不阻塞 Runtime Ops。
- ADR 0015 生态叙事作废。