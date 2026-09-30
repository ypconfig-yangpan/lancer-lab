# ADR 0016: Plugin UI Placement (not UI Types)

## Status

Accepted 2026-09-03.

**Amends [ADR 0014](./0014-plugin-view-contribution.md).**  
Depends on [ADR 0015](./0015-official-first-plugin-product.md)（Official-first）。

规格正文：[PLUGIN_VIEW_CONTRIBUTION.md](../PLUGIN_VIEW_CONTRIBUTION.md)。  
Shell 冻结确认：[SHELL_FREEZE.md](../ui/SHELL_FREEZE.md)。

## Context

ADR 0014 曾把默认路径定为「Core Presenter + declarative Resource Table」，Custom React 标成逃逸舱。  
这会把 Plugin UI 推向 Low-code Schema（JSON → Table/Form），不利于 Topology / DAG / Monaco / xterm 等真实运维界面，也与 VS Code「Contribution Point = 挂载位置」不符。

产品需要的是：

> Core 决定插件挂在哪里、与工作台如何协作；Plugin 决定内容和内部怎么画。

## Decision

1. **9 种 UI Contribution 是 Placement（挂载点），不是 UI Component Type。**  
   Activity / Explorer / Workspace / Inspector / Bottom / Action / Command / Status / Slot。
2. **Core owns：** 区域布局、Tab 引擎、PluginViewHost（ErrorBoundary / Theme / Focus / Dispose）、外层交互契约。  
   **Plugin owns：** View 内部渲染与同插件多 View 联动（Plugin Store / Events / View Params）。
3. **Full Custom React View 是一等能力**，不是异常。Declarative helpers（Table Presenter 等）仅为可选加速，不得成为唯一方式。
4. **UI 三级仍可用：** Declarative → Lancer UI Components → Full Custom；官方插件优先 Design System，但不禁止 Custom。
5. **Core 不理解**「Tree→Table」「Table→Inspector」等业务联动；这些属于 Plugin 内部。
6. **Plugin 不得越界：** Global CSS、Shell Layout、Theme Engine、全局 Tabs/Router/Toast/Dialog Root 等仍属 Lancer。
7. 验证顺序不变：`official.mock` → `official.kubernetes`；若官方插件被迫绕过 API，优先改 API。

## Alternatives

- **强制 Declarative / Low-code only（否决）：** 无法承载专业可视化。
- **ADR 0014「Custom 仅逃逸舱」（修订）：** 过严，改为正式一等能力。
- **每插件自建全局 Tabs/Shell（否决）：** 破坏工作台一致性。

## Consequences

- `PLUGIN_VIEW_CONTRIBUTION.md` 改为 Placement 契约；Declarative Presenter 降级为可选工具。
- 已实现的 `context.contributions.resourceTable` 等 **保留为便利 API**，不是强制路径。
- Kubernetes / Docker 等可用 Custom React Workspace；内部联动用 Plugin Store + View Params + Query。
- 不再以「所有 Provider 必须 declarative table」作为架构验收标准。
