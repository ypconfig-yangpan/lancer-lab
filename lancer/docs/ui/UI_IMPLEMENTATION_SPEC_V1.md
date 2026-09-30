# Lancer UI Implementation Specification V1

> **Source of Truth：** 本文 + [`references/`](./references/) 四张参考图。  
> **Shell 冻结：** [SHELL_FREEZE.md](./SHELL_FREEZE.md) / [ADR 0016](../adr/0016-plugin-ui-placement.md)。  
> **本次任务边界：** Visual System + `@lancer/ui` + `official.mock` 验收。**禁止**重做 Plugin Runtime / Contribution 模型 / Marketplace。

## 0. 目的

参考图是当前产品视觉与交互方向的 SoT。实现时**不要自行重新设计整体视觉方向**。

目标：

> OrbStack 的轻盈感 + Docker Desktop 的产品完成度 + IDE Workbench 的工作能力。

不是：Admin Dashboard / Ant Design 后台 / VS Code Clone / JetBrains Clone。

关键词：Native · Lightweight · Professional · Developer Tool · Dense but comfortable · Local-first · Modern · Calm。

### 参考图索引

| # | 文件 | Plugin 场景 |
|---|------|-------------|
| 1 | [01-application-workspace.png](./references/01-application-workspace.png) | Applications：Stage Cards + Events |
| 2 | [02-jenkins.png](./references/02-jenkins.png) | Jenkins：Jobs → Builds → Inspector → Console |
| 3 | [03-kubernetes.png](./references/03-kubernetes.png) | Kubernetes：Cluster Tree → Pod Table → Inspector → Logs |
| 4 | [04-docker.png](./references/04-docker.png) | Docker：Environments → Containers → Inspector → Terminal |

## 1. 不允许修改的产品结构

```text
Title Bar / Global Search / Global Actions
Activity | Explorer | Workspace | Inspector
Bottom: Logs / Events / Terminal / Operations
Status Bar
```

只优化：视觉、组件、spacing、surface、interaction、animation、state、resize、details。

## 2. 视觉方向

旧 UI 问题：满屏 1px border、同灰度、HTML 式 Tab、机械 Table、硬切割。

必须改用：soft surface、spacing、subtle background hierarchy、selection、typography、light border、controlled radius。

> **少用线切区域，多用 Surface 和留白建立层级。**

## 3. 布局尺寸（桌面优先）

| 区域 | 尺寸 |
|------|------|
| Activity Bar | **48–56px**（icon only） |
| Explorer | 220–280，default **240** |
| Inspector | 300–380，default **340** |
| Status Bar | **28px** |
| Title Bar | **48–56px** |
| Bottom | default **220–260**；min 120；max 70% vh |

Explorer / Inspector / Bottom：resize + collapse；记住用户尺寸。

## 4–19. 区域职责摘要

| 区域 | 归属 | 要点 |
|------|------|------|
| Title Bar | **平台** | Brand + GlobalSearch(~420×32–36) + Actions；非大 SaaS 搜索 |
| Activity Bar | **平台**；Plugin `register` | icon only；Active = 2px left + soft blue；Tooltip |
| Explorer | **Plugin 内容** | 略深 surface；row 28–34；selected soft blue + 2px accent |
| Workspace | **Plugin 内容** | Tabs = 工作对象；PageHeader / PageTabs / Toolbar / Main |
| Inspector | **平台壳 + Plugin 内容** | ~340；无选中自动折叠；PropertyList / Soft Badge |
| Bottom | **平台壳 + Plugin 内容** | Logs/Events/Terminal；双击最大化；Logs 可虚拟滚动 |
| Terminal | Plugin | **唯一允许大块深色**的区域（xterm）；外壳仍浅色 |
| Application Stages | Experience | 允许 Stage Card；经 Slot：`application.*` |

平台 vs 插件：Lancer 定挂载点；Plugin 定内部 UI。Core 不理解 Tree→Table→Inspector 业务关系。

## 20–22. `@lancer/ui`（Design System）

> **技术栈锁定见 [ADR 0002](../adr/0002-react-ui-stack.md)。**  
> 别名：`@lancer/ui` ≡ `@devops-desktop/ui` → `src/ui/`。

```text
Tailwind 4 + Radix + shadcn(零件) + TanStack
        ↓
    @lancer/ui     ← 真正的 Lancer Design System
        ↓
 Shell / Plugins
```

- **shadcn 不是 DS**，只是零件供应商（复制进 `src/components/ui` 后改 Lancer 风格）。
- Plugin **禁止** Ant/MUI，禁止各自 `button.css`。
- 业务代码应：`<PageHeader /><DataTableFrame /><StatusBadge />`，而不是页面拼 shadcn。

第一阶段至少：

```text
Button IconButton Badge StatusBadge Tag
PageHeader PageTabs Toolbar
SearchInput FilterButton Select
DataTable Tree
Panel Section InspectorSection PropertyList
EmptyState LoadingState ErrorState
LogViewer（后续） TerminalHost（后续）
```

Shell 壳层（ActivityBar / WorkspaceTabs / BottomPanel…）属平台，也逐步收口到可复用模块，但不进 Plugin 业务依赖。

## 23–28. Tokens / Radius / Shadow / Type / Spacing

语义 Token（见 `src/styles/globals.css`）：

```text
--background --surface-1 --surface-2 --surface-hover --surface-selected
--border-subtle --border-default
--text-primary --text-secondary --text-muted
--accent --accent-hover --accent-soft
--success --warning --danger --info
```

Light 基线：Workspace 近白；Explorer 略冷灰；Selected 极浅蓝；Primary 干净中蓝。**禁止**全域 `#f5f5f5`。

Radius：控件 6–8px；Card 8–10px；**禁止** 16–24 大圆角。  
Shadow：仅 Popover/Dropdown/Dialog。  
字体：系统 UI + SF Mono / JetBrains Mono；Page Title 18–22；Body 13–14；Status 11–12。  
Spacing：4px grid。

## 29–30. Interaction / Animation

可点击必须有 hover / active / focus / disabled / loading / selected。  
动画 120–180ms，克制。

## 31. PluginViewHost

统一 Theme / ErrorBoundary / Lifecycle / Context / Resize / Focus / Dispose / Crash fallback。

## 32. 目录

```text
src/shell/          # 壳（现 features/shell，渐进对齐）
src/ui/             # @lancer/ui / @devops-desktop/ui
src/styles/         # tokens
src/plugins/        # mock → k8s → docker → jenkins → application
docs/ui/references/ # 四张 SoT 图
```

## 33. 禁止 Plugin 复制 Design System

禁止 `kubernetes/button.css` 等。只用 `@lancer/ui` + Plugin-specific layout。

## 34. 实现顺序（强制）

```text
Phase 1  Tokens → Shell Surface → Activity → Explorer → Workspace → Inspector → Bottom → Status
Phase 2  Button Tabs Toolbar Input Badge Table InspectorSection Resizable
Phase 3  official.mock 达到参考图视觉/交互质量
Phase 4+ kubernetes → docker → jenkins → application-workspace
```

**先公共视觉，后真实 Plugin。** 禁止把四张图写成四套 CSS。

## 35. 第一阶段不要改架构

禁止顺便：重做 Runtime、改生命周期、改 Contribution、Marketplace、Sandbox、新 Domain Model。  
仅当现有 Plugin UI API **确实无法**支撑参考图交互时，才提案架构调整。

## 36. 图片与实现

非像素级假数据复制；保证 Visual Language / Density / Layout / Spacing / Hierarchy / Interaction / Component Style 一致。

## 37. 验收

不应再：灰、硬、满屏 border、传统后台、IDE skeleton。  
应接近：轻、清晰、专业、桌面原生、密而不压。

## 38. 四页必须可被同一套视觉语言实现

Kubernetes / Docker / Jenkins / Application —— 若 Plugin UI API 能完整支撑这四种，Architecture V1 成立。

## 39. 最终原则

```text
Shell architecture is frozen.
Improve visual design, not architectural complexity.
Plugin owns its View. Lancer owns the Workbench.
Use spacing and surfaces before borders.
Use platform components before duplicated UI.
Dense but calm. Not SaaS dashboard. Not VS Code clone.
```
