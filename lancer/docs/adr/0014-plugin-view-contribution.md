# ADR 0014: Plugin View Contribution Model

## Status

Accepted 2026-09-03. **Amended by [ADR 0016](./0016-plugin-ui-placement.md)**（Placement ≠ UI Type；Custom React 一等能力）。

Depends on [ADR 0012](./0012-plugin-runtime.md)、[ADR 0013](./0013-typescript-first-plugin.md)。

规格正文：[PLUGIN_VIEW_CONTRIBUTION.md](../PLUGIN_VIEW_CONTRIBUTION.md)。

## Context

需要明确 Plugin UI 与 Shell 的边界，避免每个插件发明互不一致的全局导航，同时避免把 UI 锁死成 Schema→Table。

## Decision（修订后摘要）

1. **Contribution Points = Placement：** Activity / Explorer / Workspace / Inspector / Bottom / Action / Command / Status / Slot。
2. **Core owns placement + outer host；Plugin owns content + internal rendering.**
3. **Declarative Presenters（Resource Table 等）是可选加速**，不是唯一默认。
4. **Full Custom React View 是正式一等能力。**
5. 同插件多 View 联动（Explorer↔Workspace↔Inspector）由 Plugin Store / Events / View Params 完成；Core 不建模业务关系。

历史表述「Custom 仅逃逸舱 / Core 拥有全部展示器」以 ADR 0016 为准废止。

## Alternatives

见 ADR 0016。

## Consequences

- 官方插件可用 Design System 保持风格；复杂页直接 Custom View。
- mock / stub 插件可继续用 declarative helpers 快速验收 Placement。
- 不得把 Lancer 做成 Low-code Schema Engine。
