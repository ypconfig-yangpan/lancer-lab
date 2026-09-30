# Plugin View Contribution

> 状态：已采纳。决策见 [ADR 0014](./adr/0014-plugin-view-contribution.md)（修订）+ **[ADR 0016](./adr/0016-plugin-ui-placement.md)**（Placement）。  
> 产品路线：[PLUGIN_PRODUCT.md](./PLUGIN_PRODUCT.md)。运行时：[PLUGIN_RUNTIME.md](./PLUGIN_RUNTIME.md)。

## 1. 核心原则（ADR 0016）

```text
Core defines placement and outer interaction contract.
Plugin defines content and internal rendering.
```

> **Lancer 定义边界与挂载位置；Plugin 定义能力与界面。**  
> **Lancer 管生命周期与 Host；Plugin 管自己的业务联动。**

**不要**把 Contribution 理解成「必须是 Table / Tree / Form」。  
9 种 Contribution 是 **Placement（挂在哪）**，不是 **UI Type（长什么样）**。

| Core 负责 | Plugin 负责 |
|-----------|-------------|
| Activity Bar / Explorer 槽位 / Tab 引擎 / Inspector 壳 / Bottom Dock | View 内部任意 React UI |
| PluginViewHost（ErrorBoundary、Theme、Focus、Dispose） | 同插件多 View 联动 |
| Command Palette / Toast·Dialog Root / Theme Engine | Provider 业务语义 |

---

## 2. V1 Placement：9 种挂载点

| # | Point | Plugin 提供 | Core 提供 |
|---|-------|-------------|-----------|
| 1 | Activity | id / title / icon / order | Activity Bar |
| 2 | Explorer | 任意 Explorer View（Tree / List / Custom） | 左侧区域布局 |
| 3 | Workspace | 任意 Workspace View | **统一 Tab System** |
| 4 | Inspector | Section（声明式或 Custom React） | 右侧区域布局 |
| 5 | Bottom Panel | 工具 View（数量克制） | Bottom Dock |
| 6 | Action | 对象操作（一次注册） | 可映射到 Toolbar / Menu / Inspector / Palette |
| 7 | Command | 全局命令 | Command Palette |
| 8 | Status Item | 0–2 建议 | Status Bar |
| 9 | Slot | 填入 Experience 槽位 | Slot 宿主 |

Settings Schema = Platform Contribution（另册）。

---

## 3. Workspace / Explorer / Inspector 自由内容

Workspace 内部可以是：

```text
Table · Tree · Graph · Canvas · SVG · WebGL · Monaco · xterm
React Flow · Dashboard · Split · Timeline · 任意 React
```

Explorer / Inspector 同理：可为声明式，也可为 Custom React。

注册形态（概念；当前代码多为 `views.register` / `inspector.register` / `contributions.*`）：

```ts
context.views.register({
  id: "kubernetes.resources",
  title: "Resources",
  location: "workspace",
  factory: () => <KubernetesResources />,
});
```

Core **只知道**有一个 Workspace View；**不知道**里面是 Tree→Table。

---

## 4. 同插件联动（Core 不管）

禁止在 Core 建模：

```text
Tree → Table
Table → Inspector
Pipeline → Logs
```

Plugin 自己用：

```text
Plugin Scoped Zustand   → 插件级 UI 选择
View Params             → Tab 局部导航状态
TanStack Query          → Remote Facts
Scoped Event Bus        → 轻量通知
```

示例：

```text
Explorer click
  → pluginStore.selectResource(ns, kind)
  → openWorkspaceTab({ viewId, params })
  → Workspace / Inspector 读 store 或 params
```

状态边界：

```text
Query     → Remote Facts（禁止整盘拷进 Zustand）
Plugin Store → Plugin UI State
View Params  → Tab Navigation State
Local State  → 组件局部
```

---

## 5. UI 实现三级（均为正式路径）

| Level | 名称 | 用途 |
|-------|------|------|
| 1 | Declarative helpers | Settings / 简单 Inspector / 简单表 — **可选加速** |
| 2 | Lancer UI Components | 官方插件优先 Design System / `@lancer/ui` |
| 3 | Full Custom View | Topology / DAG / Metrics / Diff — **一等能力** |

**禁止**把 Lancer 做成「JSON → Table/Form」唯一 Low-code 系统。

当前仓库中的 `context.contributions.resourceTable` / `treeExplorer` / `inspectorSections` 属于 **Level 1 helpers**（mock / stub 好用），**不是**强制架构。

---

## 6. Plugin 不得越界

```text
禁止：Global CSS · document.body · Main Window · Global Router
      重建 Activity Bar / Tab Engine · Theme Engine
      全局 Toast/Dialog Root · 改 Shell Layout
```

```text
Plugin View Boundary
┌─────────────────────────┐
│ Plugin almost free here │
└─────────────────────────┘
Outside → Lancer owns
```

---

## 7. PluginViewHost

Shell 通过统一 Host 渲染插件 View：

```text
ErrorBoundary · Plugin Context · Theme Tokens
Resize / Focus / Keyboard Scope
Loading / Crash Fallback · Dispose
```

已有实现：`PluginViewHost` / `PluginInspectorHost`（`plugin-kernel/react`）。

---

## 8. Slot（Experience ↔ Provider）

Experience 只挂槽位；Provider 填入组件：

```text
application.source / build / release / runtime / observability
```

Slot **内容**由 Provider 自定；Experience **不得** `import` Provider 模块。

---

## 9. Declarative helpers（可选，非强制）

若插件选择用 helper（非必须）：

- `resource-table` / `tree-explorer` / `inspector-sections`
- 取数经 `ShellFacade.apply` / `ctx.native`
- Host Presenter 渲染表/树/简单 Inspector

适用：快速 stub、简单列表。  
不适用：作为「所有 Provider 必须如此」的验收标准。

类型与注册：`plugin-kernel/contributions/`；Presenter：`plugin-kernel/react/presenters/`。

---

## 10. 与现状

| 项 | 状态 |
|----|------|
| Placement 9 点 | Activity/View/Inspector/Command/Status/Slot 等已有；统一 Action 多表面未完 |
| Custom React Workspace | kubernetes 已是；**正式合法** |
| Declarative helpers | mock + stub providers 在用 |
| Experience Slot 组合 | `official.application-workspace` stub 已演示 |
| Plugin 内部 Store 规范 | K8s 有 workspace-store；继续按 §4 边界 |

---

## 11. 验收焦点（下一步）

不要继续扩展 Plugin 概念。用真实插件验证：

```text
official.mock
  → Placement + enable/disable 清理
official.kubernetes
  → Custom Workspace + Plugin 内部联动 + 不绕过 API
```

若 K8s 实现被迫绕过 Plugin API → **优先简化 API**，禁止官方特权捷径。
