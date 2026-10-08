# Lancer Log Search UI Design

> Scope: Kubernetes Log Viewer Search UI  
> Status: Proposed  
> 用途：**交互 + ASCII 线框级设计稿**（可驱动实现）。不是视觉稿（色值/间距/组件库逐像素）。

---

## 1. UI 目标

搜索 UI 的目标不是做一个「grep 面板」。

```text
用户发现问题 → 打开日志 → 搜索 → 定位命中 → 看上下文
→ 上/下命中 → 复制上下文 /（以后）AI 分析
```

> **Search = Locate + Navigate + Context**  
> 不是 Search = 返回一个结果列表。

---

## 2. 搜索入口

工具栏紧凑 Search；**不默认常驻占顶**。

```text
┌──────────────────────────────────────────────────────────────┐
│ Container: app   Follow ●   │  Search  ⌕  │  Wrap  Copy ... │
└──────────────────────────────────────────────────────────────┘
```

快捷键：`Cmd/Ctrl + F` 打开搜索栏。

---

## 3. Search Bar

打开后：

```text
┌──────────────────────────────────────────────────────────────┐
│ 🔍  Search logs...                         3 / 17    ↑  ↓  × │
└──────────────────────────────────────────────────────────────┘
```

含：Input、Match Count、Previous、Next、Close。

扩展放 Popover（勿铺满 Toolbar）：

```text
Case sensitive / Regex / Whole word
Context Before / After（默认各 100，给 Read Window）
```

---

## 4. 交互：Debounce

输入约 **300ms debounce** 后再触发重量级 Search。  
勿每个字符打全盘搜。

---

## 5. Enter / Shift+Enter

```text
Enter       → Next Match
Shift+Enter → Previous Match
```

计数：`3 / 17` 或完整未知时 `3 / 17+`。  
**不为凑总数扫完巨大文件。**

亦可：`↑` `↓` 按钮；键盘为主路径。

---

## 6. Match Highlight

- 命中高亮；**Current Match** 比 Other Matches 更明显  
- 避免过高饱和刺眼色（跟现有 terminal 深色底协调即可）

---

## 7. 自动定位

命中后 `scrollTo`，当前行靠近 **Viewer 中央**，方便看上下文。  
勿贴顶。

---

## 8. 不要整文件重载

```text
Match line → Read Window(before/after) → Viewer
```

禁止因搜索加载 entire log。

---

## 9. 不要传统结果列表

不要侧栏「1. line 183920 …」让用户在列表与日志间来回跳。  
**Log Viewer 本身就是结果**；↑↓ 在上下文里移动。

---

## 10. Search 与 Follow

Search **不暂停 Stream**；只控制 Viewer 视口。

建议模式（概念）：

| 模式 | 含义 |
|------|------|
| LIVE | 贴尾跟新 |
| SEARCH | 视口跟当前 Match；Stream 仍写 Storage |
| PAUSED | 用户暂停展示跟随 |

搜索时勿把视口拽回底部。新行用：

```text
↓ 128 new lines • Jump to latest
```

点击才 Jump to Latest。

---

## 11. Context 操作（轻量）

当前命中可提供：

- Copy Context（整窗 before~after，非单行）  
- Analyze with AI（以后；只收 Text+元信息）  
- Open Around（可选，等同加大 Read Window）

勿在 UI 引入 Universal Log Domain 类型。

---

## 12. 错误与状态

用户可见文案：

| 状态 | 文案 |
|------|------|
| idle | Search logs... |
| searching | Searching... |
| ready | `3 / 17` 或 `3 / 17+` |
| cancelled | Search cancelled |
| error | Unable to search this log / Invalid regular expression |

勿直接甩 ripgrep/EOF 技术串。

明确状态机：`idle | searching | ready | cancelled | error`（勿一堆 boolean 推断）。

---

## 13. 换源清状态

切换 Container / Current|Previous / Pod / Session → 清空 query、matches、cursor、currentMatch。

---

## 14. Metadata 与 Search 分工

Header 管：`pod / container / Current|Previous / Follow`  
Search 条只管：`query + 3/17 + ↑↓`  
勿把 Search 做成管理后台。

---

## 15. 推荐线框（验收用）

```text
┌───────────────────────────────────────────────────────────────┐
│ payment-7d8f / app / Current                                 │
│ 10:32:20 • Running • Follow                                  │
├───────────────────────────────────────────────────────────────┤
│ 🔍 OOMKilled                         3 / 17    ↑ ↓    ⚙  ×   │
├───────────────────────────────────────────────────────────────┤
│ 294780  INFO  ...                                            │
│ …                                                            │
│ 294821  ERROR OOMKilled                         ← current     │
│ …                                                            │
├───────────────────────────────────────────────────────────────┤
│                 ↓ 128 new lines • Jump to latest              │
└───────────────────────────────────────────────────────────────┘
```

---

## 16. 原则

1. Search 不是独立页面，是 Viewer 模式  
2. 结果不把用户带离日志上下文  
3. **Current Match** 是中心，不是 Result List  
4. Search 不暂停 Stream  
5. Search 不读大文本；Match → Read Window  
6. AI 从 Context 出发  
7. 体感像「巨大但普通的日志文件」，不像复杂 K8s 子系统  

---

## 17. 与实现的映射（本仓库）

| UI | 代码落点 |
|----|----------|
| Header 身份 / Pod·Container 选择 | `kubernetes-logs-pane.tsx` toolbar |
| Search bar / 高亮 / ↑↓ / 状态 | `log-viewer.tsx`（terminal 变体优先） |
| Read Window / Search IPC | `managed-log` + `native/logs` |
| ↓ N new / Jump latest | `log-viewer.tsx` followTail 逻辑 |

视觉：复用现有 terminal 深色行、CompactSelect、icon 按钮；**不另起设计系统**。

## Related

- [k8s-log-workbench.md](./k8s-log-workbench.md)  
- [search-architecture.md](./search-architecture.md)  
- [ai-context-collection.md](./ai-context-collection.md)  
