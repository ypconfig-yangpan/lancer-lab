# K8s Log Workbench — 多模块执行说明

> 大任务，按模块拆轨；有依赖则串行，无依赖可并行。  
> 契约入口：[README.md](./README.md)

## 模块总览

```text
                    ┌─────────────────┐
                    │  M0 文档（已完成） │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              │
        ┌──────────┐  ┌──────────┐         │
        │ M1 存储   │  │ M2 衔接   │         │
        │ Index     │  │ Resume   │         │
        └────┬─────┘  └────┬─────┘         │
             │             │               │
             └──────┬──────┘               │
                    ▼                      │
             ┌──────────┐                  │
             │ M3 搜索   │                  │
             │ Search   │                  │
             └────┬─────┘                  │
                  │                        │
                  ▼                        ▼
             ┌──────────┐           ┌──────────┐
             │ M4 Workbench UI      │（部分可与 M1–3 并行）
             └────┬─────┘
                  │
                  ▼
             ┌──────────┐
             │ M5 AI 边界 │（仅遵守文档，本阶段不接模型）
             └──────────┘
```

| 模块 | 职责 | 主要路径 | 契约文档 | 依赖 |
|------|------|----------|----------|------|
| **M0** | 设计契约 | `docs/logs/*`、ADR 0005 | — | 无（**已完成**） |
| **M1** | 稀疏索引 + seek 读窗 + retention | `src-tauri/.../managed_logs/` | [storage-and-index.md](./storage-and-index.md) | M0 |
| **M2** | 历史→实时 Cursor / Overlap / Dedup | `managed_logs/stream.rs` 等 | [history-live-resume.md](./history-live-resume.md) | M0；与 M1 弱并行（落盘格式对齐） |
| **M3** | ripgrep crates 全盘搜、Cursor、取消、只返 line/offset | `managed_logs` + commands + `native/logs` | [search-architecture.md](./search-architecture.md)、[search-and-window-read.md](./search-and-window-read.md) | M1（命中后 seek 读窗） |
| **M4** | Workbench UI P0/P1 | `log-viewer.tsx`、`kubernetes-logs-pane.tsx` | [log-workbench-ui.md](./log-workbench-ui.md)、[log-search-ui.md](./log-search-ui.md) | P0 可先于 M3；Search UI 等 M3 IPC |
| **M5** | AI 采集边界 | 不接模型 | [ai-context-collection.md](./ai-context-collection.md) | 仅遵守；可选预留 Copy Context |

## 推荐节奏（串行主轴 + 并行支线）

### Sprint A — 底座（先串）

1. **M1** 必须先落地：修 `read_window` 全文件扫；否则 Follow 轮询在大日志下假死。  
2. **M2** 可紧随或与 M1 后半并行：open 参数 previous/since/tail；Cursor=`containerId+lastTimestamp`。

### Sprint B — 搜索 + UI 骨架

3. **M4-P0**（Header / Follow / ↓N new / Virtualizer 只渲数据窗）可与 **M3** 前期并行。  
4. **M3** Search IPC 就绪后接 **M4-P1**（Search Bar、高亮、Enter 导航、Export）。

### Sprint C — 增强

5. M4-P2：Jump line/time、Reconnect UI  
6. M5：仍不接 AI；Copy Context 已够「采集形状」

## 并行规则

| 可以并行 | 不要并行硬拧 |
|----------|----------------|
| M4-P0 视觉改造 ↔ M1 收尾 | M4 Search UI ↔ M3 未出 IPC |
| M2 stream 语义 ↔ M1 索引写路径（约定 JSONL 不变） | 为 UI 改落盘格式破坏 M1 |
| 文档微调 ↔ 任意模块 | 引入 Universal Log Model / 重写链路 |

## 每模块 Definition of Done（摘要）

- **M1：** 10 万行级尾窗读不线性恶化；retention 生效  
- **M2：** 历史+follow 无重复刷屏；换 containerId 不静默拼流  
- **M3：** Search 只返 matches；可取消；不阻塞 Follow；命中→read window  
- **M4-P0/P1：** 见 [log-workbench-ui.md](./log-workbench-ui.md) §61、§64  
- **M5：** PR 中无「为了 AI」的领域模型

## 禁止（全模块）

- 重写 `kubernetesApi → managed-log → LogViewer`  
- `rg` CLI 子进程、ES/Tantivy/SQLite FTS（本阶段）  
- Search 返回全文、一次灌百万 match 进 React  
- Follow 视口与 Stream 采集绑死  

## 开工口令

- `开工 M1` — 只做存储索引  
- `开工 M1+M4-P0` — 底座 + UI 骨架并行  
- `按 EXECUTION 全开` — 从 M1 起按 Sprint A→B 推进  
