# UI Guidelines

规范正文在 [ui/](./ui/README.md)。本文件只保留 **实现层约束**。

视觉 SoT：[ui/UI_IMPLEMENTATION_SPEC_V1.md](./ui/UI_IMPLEMENTATION_SPEC_V1.md) + [ui/references/](./ui/references/)。  
技术栈锁定：[adr/0002-react-ui-stack.md](./adr/0002-react-ui-stack.md)。

方向：OrbStack 轻盈 + Docker Desktop 完成度 + IDE Workbench。**不是** SaaS Admin。

## 定死的 Stack

```text
Tailwind 4 + Radix + shadcn(零件) + TanStack Table/Virtual
  → @lancer/ui（真正的 Design System）
  → Shell / Plugins
```

- **禁止** Ant Design / MUI / Chakra / Mantine 等第二套 Framework
- **禁止**把 shadcn 默认外观当产品 DS
- Plugin / Feature 优先：`import { … } from "@lancer/ui"`（别名 `@devops-desktop/ui` 同义）
- Tailwind 主要写在 `@lancer/ui` 与 Shell 组件内部，业务页少堆 utility

## 谁负责什么

| 层 | 负责 |
|----|------|
| Radix | Dialog / Dropdown / Tooltip / Popover / Tabs / Focus / ARIA |
| shadcn | 复制改造的基础件起点 |
| TanStack Table + Virtual | 表逻辑与虚拟列表 |
| react-resizable-panels | 三栏 + Bottom 拖拽 |
| Monaco / xterm / ECharts* | 专业引擎（\*ECharts 按需） |
| `@lancer/ui` | PageHeader · DataTable · Tree · StatusBadge · Inspector · LogViewer … |
| Shell | ActivityBar · WorkspaceTabs · BottomPanel · StatusBar 布局壳 |

## Token

颜色只用 `src/styles/globals.css` 语义变量（`--surface-*` · `--accent*` · status…）。业务禁止硬编码 hex。

## 做 UI 前必问

1. 属于 Shell 哪一区？（Placement，见 ADR 0016）
2. 能否用现成 `@lancer/ui` 组件？不能 → 先加进 `src/ui/`，再给 Plugin 用
3. 是否在复制 Ant/MUI 后台布局？（若是 → 停）
4. 大列表是否走 TanStack Virtual？
5. Cluster / Namespace / Environment 是否该在 Status 可见？
