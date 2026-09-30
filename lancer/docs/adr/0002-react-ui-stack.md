# ADR 0002: React UI Stack（修订）

## Status

Accepted 2026-09-01. **Amended 2026-09-03** — 锁定分层与 `@lancer/ui` 边界（对齐 [UI_IMPLEMENTATION_SPEC_V1](../ui/UI_IMPLEMENTATION_SPEC_V1.md)）。

## Context

产品视觉目标是 **DevOps IDE / Workbench**（OrbStack 轻盈 + Docker Desktop 完成度 + IDE 工作能力），不是企业 Admin Dashboard。

需要：

- 可组合、紧凑、Token 驱动
- Dialog / Dropdown / Focus Trap / ARIA 等交互不要从零造
- DataTable / Tree / Logs / Shell 视觉由我们自己打磨
- 禁止第二套大 UI Framework 的默认外观主导产品

## Decision

### 1. 分层（定死）

```text
React 19 + TypeScript + Vite + pnpm
        ↓
Tailwind CSS 4          → Layout / utility / token 桥接
Radix UI                → Dialog Dropdown Tooltip Popover Tabs … 行为 + a11y
shadcn/ui               → 零件起点（复制进仓库后改成 Lancer 风格，不是在线依赖）
TanStack Table/Virtual  → 表与虚拟列表引擎
react-resizable-panels  → Explorer / Inspector / Bottom 拖拽
cmdk + Sonner + Lucide  → Command / Toast / Icons
Monaco / xterm / ECharts（按需）→ 专业引擎
        ↓
    @lancer/ui（= @devops-desktop/ui → src/ui）
        ↓
────────────────────────────
 Lancer Shell    Plugins
```

**原则：专业能力用成熟引擎，视觉外壳自己控制。**

### 2. shadcn 不是 Design System

shadcn / Radix = **零件供应商**。  
真正的 Design System = **`@lancer/ui`**。

插件与 Shell 业务代码应写：

```tsx
import { PageHeader, DataTableFrame, StatusBadge } from "@lancer/ui";
```

禁止页面里直接堆大量未封装的 shadcn className 拼盘；Tailwind 主要留在 `@lancer/ui` / Shell 组件内部。

### 3. 直接采用（复制改造）的基础件

Button · Input · Select · DropdownMenu · ContextMenu · Tooltip · Popover · Dialog · Tabs · Checkbox · Switch · ScrollArea · Separator · Command  

来源：Radix 行为 + shadcn 起点 → 改成 Lancer Token / 圆角 / 密度。

### 4. `@lancer/ui` 必须自研打磨

| 类别 | 组件 |
|------|------|
| Shell | AppShell · ActivityBar · Explorer 壳 · WorkspaceTabs · Inspector 壳 · BottomPanel · StatusBar |
| 工作台 | PageHeader · PageTabs · Toolbar · PropertyList · InspectorSection · StatusBadge · Tag · SearchInput |
| 数据 | DataTable · Tree |
| 平台 | PluginViewHost · SlotHost · ResizablePane（封装 panels） |
| 专业壳 | LogViewer · TerminalHost（内嵌 xterm） |

尤其 DataTable / Tree / Logs / Workspace Tabs / Inspector：**不依赖**任何大 Framework 的默认 Table/Layout。

### 5. 专业区域底层（按需引入）

| 能力 | 引擎 |
|------|------|
| Terminal | xterm.js（`@xterm/xterm` + addons） |
| YAML / Diff / Code | Monaco |
| Chart | ECharts（需要时再加） |
| Topology / DAG | React Flow（真正需要时再加） |
| Huge list | TanStack Virtual |

### 6. 明确禁止

- **Ant Design / MUI / Chakra / Mantine / Fluent / PrimeReact / Blueprint**（易成 Admin Dashboard，视觉语言过强）
- 为表格换成 Ant Table
- 纯手写 Popover / Dialog / Focus Trap / ARIA Select（无意义）
- Plugin 各自 `button.css` / 第二套 Design System
- JSX 业务层散落硬编码 hex；颜色进 CSS Variables / Tokens

### 7. Token

`:root` / `.dark` 语义变量（`--background` · `--surface-*` · `--border-subtle` · `--accent*` · status…），见 `src/styles/globals.css`。Tailwind `@theme` 映射这些变量。Dark Theme 只改 Token。

## Alternatives

| 方案 | 结论 |
|------|------|
| Ant / MUI 全家桶 | **否决** — Admin 味，难做成 OrbStack/IDE |
| 全部纯手写 | **否决** — a11y / overlay 成本过高 |
| 只用 shadcn 默认外观 | **否决** — shadcn ≠ Lancer DS |
| 自研 Table 引擎 | **否决** — 用 TanStack Table + Virtual，外壳自研 |

## Consequences

- 缺基础交互件：优先 `pnpm` 加对应 `@radix-ui/*`，按 shadcn 模式落进 `src/components/ui`，再 export / 包装进 `@lancer/ui`。
- 缺 Lancer 语义件：只加在 `src/ui/`，文档与验收对齐参考图。
- 现有依赖已含：Tailwind 4、TanStack Table/Virtual/Query、resizable-panels、cmdk、sonner、lucide、monaco、xterm、cva。Radix 目前主要是 `@radix-ui/react-slot`；按组件需要增量加 Dialog/Dropdown/Tooltip 等。
- ECharts / React Flow：**未装**；有拓扑/图表需求时再 ADR 补一句即可。
- 视觉实现顺序仍见 Spec V1 §34：Tokens → Shell → `@lancer/ui` → mock 验收 → 再迁真实 Plugin。
