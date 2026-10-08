# ADR 0005: Large Log Architecture

## Status

Accepted（2026-09 初版；2026-10 扩写：产品边界与 K8s Log Runtime）

## Context

日志是一等公民。可能面对几十万行乃至 GB 级文件；不得拖垮 JS Heap 与 DOM。

同时要明确：Lancer 是 DevOps **工作台**，不是统一日志平台，也不是迷你 Elasticsearch。K8s / Docker / Jenkins 日志语义不同，**统一体验，不统一语义**。

## Decision

### 技术底线

- Rust 负责文件、Seek、搜索、Regex、下载、导出、稀疏索引、stream
- React 只展示当前**数据窗口**上的 Virtual List（TanStack Virtual）= **视觉窗口**
- 禁止：把完整大日志读成 JavaScript String、parse 成百万 React object、或全部 render 到 DOM
- Chunk / Window 传输（约 2k–10k 行，由实现与 benchmark 决定）
- 超限历史落本地文件（Disk-as-Source）；UI 只持有界窗口

### 产品底线

- **对人：Runtime**（强阅读、跟尾、搜索、跳转）
- **对 AI：Context / Text**（以后从当前工具采一段文本；见 [ai-context-collection.md](../logs/ai-context-collection.md)）
- **不建立 Universal Log Model**（不做跨工具的 LogSession / LogLine / LogProvider / LogEvidence 领域层）
- K8s 日志走现有链路加深：`kubernetesApi` → `managed-log` → `readLogWindow` → `LogViewer`
- **不**做 Logging Operator / 外送 ES/Splunk；那是 Rancher Logging 的问题，不是本机排障工作台的问题

### 双窗口

```text
Rust read_window / follow append
        ↓
  数据窗口（有界行集）
        ↓
React virtualizer
        ↓
  视觉窗口（可见 DOM）
```

后端负责数据窗口；前端负责视觉窗口。两者缺一不可。

## Alternatives

- textarea / 全量 state：大数据必然崩溃
- 仅前端 Worker：仍占内存，凭证与文件边界不清
- 统一 LogProvider + 领域模型：过早抽象，抹平 K8s 语义，违背「先做深真实工具」
- 本机迷你 ES：范围错误

## Consequences

- Log Viewer 必须 virtualization，且不得假设「全部行在内存」
- 实现规格见 [docs/logs/](../logs/README.md)
- 诊断日志（`app.log`）与 Pod 业务日志分离（见 [ADR 0011](./0011-application-logging.md)）
- `benchmarks/` 应对大窗口读与搜索做回归（按需加深）

## Related

- [docs/logs/README.md](../logs/README.md) — 实现文档索引与刀序
- [PRODUCT_MODEL.md](../PRODUCT_MODEL.md) — 先集成后抽象
