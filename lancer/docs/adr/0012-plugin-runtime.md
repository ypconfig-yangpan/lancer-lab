# ADR 0012: Plugin Runtime Kernel

## Status

Accepted. **Amended by [ADR 0013](./0013-typescript-first-plugin.md)**（TypeScript First、共享 Lazy Extension Host、Rust = Native Accelerator）。

## Context

DevOps Desktop 需要把 Kubernetes 等能力从 Core 解耦为插件，同时支持未来 External Plugin。既要有明确生命周期与资源回收（类似 Spring / VS Code Extension Host），又要保持 Harness 风格的单一 `apply()` 业务入口。此前 [ARCHITECTURE_RULES.md](../ARCHITECTURE_RULES.md) 写明 V1 不做 Plugin System；产品方向已明确需要 Plugin Kernel，本 ADR 正式采纳。

## Decision

- 引入 `src/plugin-kernel`：`PluginManager` + `PluginLifecycleManager` + `PluginContext` + `PluginScope` + Disposable。
- Platform Services（Command/View/Slot/Activity/Inspector/StatusBar/Session/Operation）由 Core 拥有；插件只拿 Scoped facade。
- Built-in 与 External 使用同一 Plugin API。Built-in 仅是分发概念，不是架构特权。
- Frontend V1：`BundledFrontendPluginLoader`；`unload` = Logical Unload（不承诺 JS module 物理卸载）。
- Tabs 只存 `viewId`/`pluginId`，不存 React ComponentType。
- 生命周期 Hook 有集中 timeout（见 `plugin-kernel/config.ts`）；每插件 lifecycle 操作串行排队（见实现）。
- 第一验收：`official.mock`；第二：`official.kubernetes` 迁移到同一 API。

**语言与运行时拓扑**（原「立刻做独立 Extension Host = 过度设计」）由 [ADR 0013](./0013-typescript-first-plugin.md) 修订：

- 插件默认 TypeScript；Rust 不做每插件必选 Backend。
- 目标拓扑：UI Side（WebView）+ 共享 Lazy JS Extension Host + Rust Native Capabilities。
- V1 可暂在同进程实现 Kernel 与插件模块；不得将「无 Extension Side / 无 `ctx.native`」写成终态。

## Alternatives

- 简单 `registerPlugin()` 无生命周期：无法保证 disable 不泄漏。
- Core 硬编码 Kubernetes：阻止 Docker/Git 等多能力扩展。
- （历史）永久不做 Extension Host：由 ADR 0013 否决为终态。

## Consequences

- ARCHITECTURE_RULES 中「V1 不做 Plugin System」由本 ADR 取代（Plugin Kernel 允许；Marketplace/Sandbox 仍不做，直至单独 ADR）。
- Shell 通过 Contribution 渲染，不再硬编码 Pod 面板为 Core。
- 必须维护 enable/disable/reload 回归测试（含 activate↔deactivate ×20）。
- 未来增加 External loader / Extension Host 进程时不得改变 Plugin 上层 API（`activate` / `apply` / `deactivate`）。
- 完整语言与 Host 规范见 [PLUGIN_RUNTIME.md](../PLUGIN_RUNTIME.md) 与 ADR 0013。
