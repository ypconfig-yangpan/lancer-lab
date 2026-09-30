# ADR 0015: Official-first Plugin Product Architecture

## Status

Accepted 2026-09-03.

Depends on [ADR 0012](./0012-plugin-runtime.md)、[ADR 0013](./0013-typescript-first-plugin.md)、[ADR 0014](./0014-plugin-view-contribution.md)。

规格正文：[PLUGIN_PRODUCT.md](../PLUGIN_PRODUCT.md)。

## Context

Lancer 需要同时做到两件事：

1. **产品**：用户打开就能用 Kubernetes / Docker / Git 等官方能力（不是空壳插件平台）。
2. **架构**：这些能力从第一天就是 Plugin；未来第三方生态不改 Plugin API。

若把 K8s/Docker 做成 Core Feature，或设计十几种 Plugin Type / Marketplace 先行，都会偏离目标。

## Decision

采用 **Official-first + Plugin-native + Ecosystem-ready**：

1. **所有 DevOps 产品能力必须是 Plugin**（`official.kubernetes`、`official.docker`、…）。Core 禁止出现 Provider 业务概念与后门特判。
2. **产品层只定义 2 种 Plugin：** `Provider Plugin`（连外部系统）与 `Experience Plugin`（组织工作场景，如 Application Workspace）。底层共用同一 Runtime / Lifecycle / Context（不为两种类型做两套生命周期）。
3. **V1 分发只有 Bundled Official Plugin**；经 Catalog → Loader → Runtime → activate。不做 Marketplace / ZIP / 签名 / Sandbox / External install。Built-in ≠ 架构特权。
4. **UI Contribution 固定 9 种：** Activity、Explorer、Workspace、Inspector、Bottom Panel、Action、Command、Status Item、Slot。Settings Schema 属 Platform Contribution。
5. **UI 实现三级：** Declarative（优先）→ Platform React（`@lancer/ui` / Design System）→ Custom View（逃逸）。Plugin 不得控制 Shell / Theme / 全局 Tabs 等（见 PLUGIN_PRODUCT）。
6. **实现顺序（用真实插件验证 API，不为概念而扩概念）：**  
   `mock` → `kubernetes` → `docker` → `git`/`ssh` → `jenkins` → `application-workspace` → `argocd`/`harbor`。
7. 技术默认仍遵循 ADR 0013（TypeScript First）与 ADR 0014（展示契约）。若官方插件写起来要绕过 Plugin API，**优先简化 API**，禁止官方特权捷径。

## Alternatives

- **空插件平台 + 后期填能力：** 否决；V1 必须开箱可用。
- **Core 内硬编码 K8s/Docker：** 否决；阻止多 Provider 与未来生态。
- **十几种 Plugin Type / 立即 Marketplace：** 否决；过度设计。
- **Experience 直接 import Provider 模块：** 否决；只经 Slot / Contribution 组合。

## Consequences

- 新增 [PLUGIN_PRODUCT.md](../PLUGIN_PRODUCT.md) 为产品/插件分类与路线真源。
- ROADMAP / DEVELOPMENT_PLAN 按 P0–P6 官方插件顺序推进；当前已实现 `official.mock`（平台验收）与 `official.kubernetes`（能力迁移中）。
- Slot（尤其 Application Workspace）是 Experience↔Provider 组合核心；P5 前先把 9 种 Contribution 与 mock/k8s 做实。
- External / Marketplace 仍禁止，直至单独 ADR。
