# K8s Log Runtime — 设计文档索引

本目录是 **Kubernetes 日志工作台** 的可执行设计（给实现用）。  
应用诊断日志（`app.log`）见 [ADR 0011](../adr/0011-application-logging.md)，与本文无关。

## 原则（一句话）

**对人 Runtime，对 AI 以后采文本。统一体验，不统一日志语义。不做 Universal Log Model。**

详见扩写后的 [ADR 0005](../adr/0005-large-log-architecture.md)。

## 文档

| 文档 | 职责 |
|------|------|
| [k8s-log-workbench.md](./k8s-log-workbench.md) | 产品能力：Workload→Pod→Container、Previous/Since/Tail… |
| [log-workbench-ui.md](./log-workbench-ui.md) | **Workbench UI 总稿**：布局、Header/Toolbar/Viewer、P0–P3、组件与状态边界 |
| [log-search-ui.md](./log-search-ui.md) | Search UI 线框细节（从属于 Workbench） |
| [history-live-resume.md](./history-live-resume.md) | 历史 → 实时：Stream Cursor、Overlap、Dedup |
| [storage-and-index.md](./storage-and-index.md) | JSONL、稀疏索引、seek、retention（服务 **Read**） |
| [read-window.md](./read-window.md) | **正式模型**：滑动 Read Window、Follow、Reset View、Scroll Anchor |
| [viewer-session-architecture.md](./viewer-session-architecture.md) | **权威**：Viewer↔Session、L1/L2/L3、Active/Suspended、交互与状态栏 |
| [session-keepalive.md](./session-keepalive.md) | Suspend 断流保盘、45s TTL、LRU=2、sinceTime 补流 |
| [search-and-window-read.md](./search-and-window-read.md) | Search≠Read 契约；时间跳转；导出 |
| [search-architecture.md](./search-architecture.md) | Search 引擎：ripgrep crates、取消、不阻塞 Follow |
| [ai-context-collection.md](./ai-context-collection.md) | AI 边界：采集 Text，不建 Log 领域模型 |

## 实现链路（不重构）

```text
kubernetesApi.openLogs / readLogWindow / …
        ↓
Rust managed-log（Disk-as-Source）
        ↓
LogViewer（终端 / 底栏）
```

## 多模块执行

大任务拆轨与并行规则见 **[EXECUTION.md](./EXECUTION.md)**（M0–M5）。

```text
M0 文档 ✅
M1 存储 Index → M2 Resume → M3 Search
M4 UI：P0 可与 M1/M3 部分并行；Search UI 等 M3
M5 AI 边界：本阶段不接模型
```## 明确不做

- LogProvider / 跨工具统一 LogSession·LogLine 领域层
- Logging Operator、外送 Elasticsearch / Splunk
- B+Tree / SQLite 全文 / 独立索引服务（第一阶段）
- 为 AI 预埋胖抽象；需要时再从各工具「采一段文本」
