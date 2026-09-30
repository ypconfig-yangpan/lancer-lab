# ADR 0013: TypeScript First Plugin Architecture

## Status

Accepted 2026-09-02.

Amends [ADR 0012](./0012-plugin-runtime.md)（语言与运行时拓扑）and clarifies [ADR 0004](./0004-rust-kubernetes-client.md)（Rust K8s = Native Capability，不是「每插件必写 Rust Backend」）。

规格正文：[PLUGIN_RUNTIME.md](../PLUGIN_RUNTIME.md)。

## Context

Lancer 已有 Plugin Kernel（生命周期、Scoped Contribution、Logical unload）。若默认把每个 Provider 做成「Frontend TS + 独立 Rust Backend」，会出现：

- 插件作者必须学 Rust / Tauri IPC 才能做普通 REST / SDK 集成；
- Built-in 与未来 Community 插件容易分裂成两套 API；
- 「一插件一 Node/Rust 进程」抬高无用 baseline 内存。

产品目标是：**插件写起来像 Harness / VS Code Extension，平台能力用起来像操作系统 API。**

## Decision

采用 **TypeScript First Plugin Architecture**：

1. **TypeScript 是插件默认实现语言。** 官方内置与未来第三方优先同一 Plugin SDK（`manifest` / `activate` / `apply` / `contributions` / `deactivate`）。
2. **Rust 是 Native Platform Kernel / Accelerator**，不是每个插件的默认 Backend Framework。仅在 native access、security、throughput、memory control、heavy IO 有明确收益时使用。
3. **一个逻辑插件两个 TS 区域：** UI Side（React WebView）与 Extension Side（JS Extension Host 中的 backend logic）。禁止把 Provider auth、CLI、凭证、无约束 FS 放进 UI。
4. **共享、懒启动的 JS Extension Host：** 一个 Host 加载 N 个 JS backend plugins；禁止默认 one-runtime-per-plugin。0 个活跃 JS backend plugin ⇒ 可不保留 Extension Host 进程（delayed shutdown 可选）。
5. **Native Capability 经 `PluginContext` 暴露**（目标：`ctx.native.*`）。插件不直接依赖 Tauri command 名称。
6. **Built-in 仅是分发概念**，不是架构特权；不建立「Built-in Rust API vs Community JS API」两套体系。
7. **下一阶段不强迁现有内置插件为 Rust Backend。** 优先验证：`official.mock` 纯 TS；`official.kubernetes` = TS UI + TS Extension logic + Rust Native 仅在必要处。

默认实现语言对照（摘要）：

| 能力 | 默认 |
|------|------|
| REST / Provider SDK / JSON mapping / orchestration / UI | TypeScript |
| 大日志 / 大文件 / Regex·Search / Compression / PTY / Credential Vault / Process 安全控制 / 高吞吐 stream | Rust |

## Alternatives

- **每插件 Rust Backend（否决为默认）：** 开发摩擦过高；与 Community 插件分裂。
- **立即 Electron 式 everything-in-Node（否决）：** 失去 Tauri 轻量 kernel 与 native 边界。
- **立即一插件一 Node 进程（否决为默认）：** 重复 helper/runtime 内存；与「避免无用 heavy baseline」冲突。
- **保持 ADR 0012「V1 永不做 Extension Host」（修订）：** Kernel 可先同进程落地；**目标拓扑**必须预留共享 Lazy Extension Host，避免 UI 与 Extension 永久粘死。

## Consequences

- `PLUGIN_RUNTIME.md` 以 TypeScript First 为正式规范；实现可分阶段（先同进程逻辑分离与 `ctx.native` 门面，再真 Extension Host 进程）。
- ADR 0012 的 Kernel / Contribution / Logical unload 决策仍有效；其中「立刻做独立 Extension Host = 过度设计」收窄为：**V1 可不实现独立进程，但不得把「无 Extension Side」写成终态架构。**
- ADR 0004（kube-rs）仍适用于需要 Rust 的 K8s Native 路径（watch、大日志、安全边界等）；普通 list/get/mapping **允许**迁到 Extension TS，不要求新 Provider 默认复制「整包 Rust 客户端」。
- Core 不得新增 `KubernetesService` / `DockerService` 等领域服务；能力在 Plugins。
- 验收优先：`activate → register UI → apply → JS provider → optional ctx.native → UI → deactivate → cleanup`。
