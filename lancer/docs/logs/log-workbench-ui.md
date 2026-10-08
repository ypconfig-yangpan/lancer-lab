# Lancer K8s Log Workbench UI Design

> Status: Proposed  
> Scope: Lancer Kubernetes Log Workbench  
> Audience: Frontend / Cursor implementation  
> Related: [ADR 0005](../adr/0005-large-log-architecture.md), [k8s-log-workbench.md](./k8s-log-workbench.md), [log-search-ui.md](./log-search-ui.md), [search-architecture.md](./search-architecture.md)

用途：**Workbench 级交互 + 视觉方向 + 组件/状态边界 + P0–P3 优先级**。  
Search 细交互以 [log-search-ui.md](./log-search-ui.md) 为准；本文定义整页骨架与非 Search 行为。

---

## 1. Product Positioning

不是简单 `Log Viewer`，而是 **Kubernetes Log Workbench**：

```text
打开日志 → 定位问题 → 读上下文 → 持续观察 → 搜索/跳转 → 复制上下文 →（以后）AI
```

> **让开发者感觉自己在操作一个巨大但普通的日志文件，而不是复杂的 Kubernetes 管理后台。**

---

## 2. Overall Visual Direction

延续 Lancer Desktop Workbench：

- 克制、高信息密度、工具感、轻量  
- 不做 Web Admin / 传统 K8s Dashboard  
- 不堆 Card、巨大标题、大量彩色 Badge、大面积渐变、复杂图表  

结构：

```text
工具栏 + 信息上下文 + 大面积日志
```

> **Log Viewer 是绝对视觉主体。**

---

## 3. Page Structure

```text
┌───────────────────────────────────────────────────────────────┐
│ Log Header                                                   │
├───────────────────────────────────────────────────────────────┤
│ Log Toolbar                                                  │
├───────────────────────────────────────────────────────────────┤
│                       LOG VIEWER                             │
├───────────────────────────────────────────────────────────────┤
│ Context / Selection Actions                                  │
├───────────────────────────────────────────────────────────────┤
│ Runtime Status / Follow / New Lines                          │
└───────────────────────────────────────────────────────────────┘
```

默认不拆大量左右 Sidebar；日志占绝大多数空间。

---

## 4. Header

回答：「我现在看的是哪一份日志？」

```text
payment-7d8f / app / Current
prod • payment • container: app • Running
```

| 层级 | 内容 |
|------|------|
| Primary | Pod、Container |
| Secondary | Namespace、Container State |
| Runtime | Current / Previous |

**勿**塞 Node / IP / Deployment UID / ReplicaSet / Labels / Annotations（归 Inspect）。

---

## 5. Container / Lifecycle Selector

多容器下拉；Current / Previous 分开选择。

> Current 与 Previous 是不同 Container Lifecycle，**不要**表现成同一条连续日志。

---

## 6. Toolbar

单行，优先：

```text
Search │ Follow ● │ Since ▾ │ Wrap │ Timestamp │ Copy │ ⋯
```

常用可出文字（Search / Follow）；次要用 Icon（Copy / Download / Fullscreen）。  
另含：Pause、Export Visible / Export Full、Fullscreen。

---

## 7–10. Follow / Pause / New Lines

| 概念 | UI 语义 |
|------|---------|
| Follow / Live | 视口自动跟尾；`● Follow` |
| 向上滚动 | 退出视口追踪；**Stream 不停** |
| Pause | 用户主动暂停阅读跟随；**不等于**停 K8s stream（Runtime 决定是否仍落盘） |
| New lines | 离尾时底部浮层：`↓ 128 new lines` / Jump to latest |

颜色只表达状态，不做大面积 Badge。

---

## 11–18. Log Viewer 行呈现

列：Line（等宽、低权重、右对齐）│ Timestamp（可开关；无则勿伪造）│ Message（等宽）。

- 行高约 `1.45–1.6`，高密度  
- stdout/stderr：勿每行刷 `[stdout]`；subtle gutter / hover / filter  
- Level：无可靠结构化 level 时**不伪造**；有则 INFO 默认 / WARN 轻强调 / ERROR 明显但不整行刷红  

字体：`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas`（或 `@lancer/ui` token）。

---

## 19–20. Hover / Selection

Hover：轻微背景；右侧轻量 Copy line / Copy context。  
Selection：Click / Shift+Click / Drag → 浮动 Action Bar：`Copy · Copy Context · Analyze with AI`（小、不遮挡、可消失）。

---

## 21–25. Search

Search 是 Viewer **模式**，非独立页。细节见 [log-search-ui.md](./log-search-ui.md)。

摘要：`Cmd/Ctrl+F`、Debounce、`3/17` 或 `3/17+`、Enter/⇧Enter、Plain 默认、Context ±100 → Copy / AI。

---

## 26–28. Jump

| 能力 | 优先级 |
|------|--------|
| Jump to Line（`Cmd/Ctrl+L`） | P2 |
| Jump to Time | P2 |
| 轻量 Timeline | P3，非复杂图表 |

均走 Read Window，不加载全量。

---

## 29–30. Wrap / Horizontal Scroll

默认 Wrap OFF；OFF 时横向滚动**仅限 Viewer 内**，勿整页浏览器横滚。

---

## 31–33. Virtualization / Loading

```text
Disk → Rust Read Window → React → Virtualizer → Visible Rows
```

禁止千万行进 React State。Loading 文案：`Loading log window...` / `Searching...`（可 Cancel），勿 `Loading entire log...`。

---

## 34–36. Stream / History / Rotation

- Reconnecting：状态条，**不清空**已有日志  
- History→Live：用户感觉「一直在那里」；勿醒目 History Mode / Live Mode 切换戏  
- Rotation：明确「Requested history is no longer available」+ Fetch available / Start from current  

---

## 37–39. Empty / Restart / Previous

- Empty：克制文案，无巨大插画  
- Restart：lifecycle 分隔线，非普通日志行  
- Previous：明确「上一次 Container Lifecycle」  

---

## 40–42. Copy / Download / Fullscreen

- Copy：Line / Selection / Context（原始文本，无 UI 装饰字符）  
- Export Visible ≠ Export Full（文案必须诚实）  
- Fullscreen：`Cmd/Ctrl+Shift+F`；Header 可压缩  

---

## 43–45. Context / AI

- Action Bar 小浮动  
- AI：第一阶段仅 `Analyze with AI`；不常驻巨大 Chat；全局 Assistant 承载回复  
- Context Preview：可选，非必须立即实现  

---

## 46–49. Theme / Typography / Scrollbar

- Log Viewer 随 Light/Dark/System；暗色：非纯黑、非荧光；亮色：浅底 + 工具感，勿普通白表格  
- 日志约 12–13px mono；UI 12–14px  
- Scrollbar 细、低存在感；Search Match Map 为后续增强  

---

## 50–51. Match Map / 不做 Minimap

可后期在滚动条旁做 Match 分布点；**不做**完整日志 minimap。

---

## 52. Highlight 优先级

```text
Current Match > Selection > Search Match > Hover > Normal
```

---

## 53. Keyboard（第一版）

```text
Cmd/Ctrl+F          Search
Enter / Shift+Enter Next / Previous
Esc                 Close Search
Cmd/Ctrl+L          Jump to Line
Cmd/Ctrl+Shift+F    Fullscreen
Space               Follow / Pause（视口）
```

---

## 54. Responsive

Desktop：优先 1280×800 / 1440×900 / 1920×1080。不做 Mobile UI。

---

## 55. 禁止 Admin 化

禁止巨大 Card、复杂 Dashboard、大量侧栏与 Metadata。主体永远是 Log Content。

---

## 56. Component Structure（职责，非强制新包）

```text
LogWorkbench
├── LogHeader (Pod / Container / Lifecycle)
├── LogToolbar (Search / Follow / Filters / Actions)
├── LogViewer (Gutter / Row / Highlight / Selection)
├── LogContextBar
└── LogStatusBar (Stream / NewLines / JumpToLatest)
```

优先拆分现有 `log-viewer.tsx` + `kubernetes-logs-pane.tsx`；**不为每个按钮造复杂 abstraction**。

---

## 57. State Boundaries

| 桶 | 内容 |
|----|------|
| Runtime | stream、cursor、connection、source |
| Viewer | scroll、follow 视口、selection、window |
| Search | query、mode、matches、cursor、currentMatch |
| UI | fullscreen、toolbar、popover |

不要塞进单一巨型 Zustand。

---

## 58. Data Flow

```text
Kubernetes → Rust Log Runtime → persist / stream / search
  → Search Result → Read Window → Viewer State → Virtualized Viewer
```

---

## 59. Performance Rules

禁止：整文件进 React、每行大量 state、每字符重渲全 Viewer、Search 结果全集进 React、Follow 每行整树 render。  

应：Windowed data、Virtualized rows、Memoized rows、Stable identity、Batched stream updates、Debounced search、Incremental matches。

---

## 60. Happy Path（验收叙事）

打开 Pod → Container → 历史+Follow → 上滚看历史 → `↓ N new` → Search → Enter 跳 ERROR → ±100 上下文 → Copy Context →（以后 AI）→ Jump to Latest → 继续 Follow。  
体感是强开发者日志工具，不是「正在操作 Kubernetes API」。

---

## 61. 实现优先级

**P0：** Header、Toolbar、Viewer、Container、Current/Previous、Follow、Pause、Jump to Latest、Virtualization（数据窗+视觉窗）  

**P1：** Search、Highlight、Prev/Next、Regex、Copy、Selection、Context、Download（Visible/Full）  

**P2：** Jump to Line/Time、Match Map、Reconnect UI、History Recovery UI  

**P3：** AI Context、Timeline、Multi-container / Cross-Pod  

---

## 62. 设计原则（摘要）

1. Viewer 主体，Search 是导航  
2. Follow 控制视图，不控制采集  
3. 历史与实时视觉上像同一份文件  
4. Search → Match → Context → AI  
5. 前端只拿当前 Window  
6. Metadata 克制  
7. 非 Dashboard、非表格  
8. 接近 Terminal + IDE  

---

## 63. Cursor Implementation Constraint

1. 复用现有 LogViewer / managed-log；不重写 `kubernetesApi → managed-log → LogViewer`  
2. UI 改造优先，不无故改已工作的 Runtime  
3. Search Engine 按 [search-architecture.md](./search-architecture.md)  
4. Windowed Read + Virtualization 硬约束  
5. 不引入 Universal Log Model / Plugin abstraction / 多余 domain model  
6. 新 UI 状态有明确生命周期  
7. 优先 `@lancer/ui` 与 Design Token  
8. Desktop Workbench 风格  
9. 先 P0/P1，再 P2/P3  

---

## 64. Definition of Done（第一阶段）

开发者可完成 §60 主路径；且约百万行级不导致 React 卡顿、内存暴涨、全页重渲、Search 阻塞 Follow。

## Related

- [k8s-log-workbench.md](./k8s-log-workbench.md) — 产品能力清单  
- [log-search-ui.md](./log-search-ui.md) — Search 线框细节  
- [history-live-resume.md](./history-live-resume.md) — Cursor / Overlap  
