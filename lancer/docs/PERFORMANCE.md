# Performance

产品原则：**Performance First**。优化必须以 [BENCHMARK_PLAN.md](./BENCHMARK_PLAN.md) 与 `benchmarks/` 数据为准，禁止口头「应该很快」。

Desktop 不是数据库。React 树不是日志库。K8s API 不是永久日志归档。本地磁盘有限额。

---

## Logs

**MUST NOT**：完整日志进入 JS Heap；无限 `setLogs(prev => [...prev, line])`；每行一次 setState；巨大 JSON 长期驻留。

**MUST：**

```
K8s / File
  → Rust bounded channel
  → Disk (source of truth)
  → Chunk / range / search hits
  → React viewport
  → TanStack Virtual
```

UI buffer 有界；超限历史只在磁盘。React：滚动、选择、高亮。Rust：read/seek/regex/gzip/download/export/index。

超长行折叠。内部时间 UTC Instant。可能丢日志必须可见。文件名含 cluster/ns/pod/container/startTime。

---

## Streaming

- Bounded channel；**禁止 unbounded**。
- 背压：消费者慢则优先落盘；UI 可降频，**不得丢原始日志**。
- UI 更新 batch（约 50–100ms，benchmark 修正）。
- Watch / Stream 可取消；关 Tab 停 Rust task。
- 禁止 Query 轮询模拟 live logs。

---

## Large File

Search、Regex、Export、Compression **MUST** 在 Rust。stream-to-file；禁止整文件进内存再 String。用户 Regex 防 catastrophic backtracking。搜索结果 count + 分页，取消旧查询。

阈值（10MB/50MB 等）由 benchmark 确定。

---

## Lazy Loading

Monaco、ECharts、Terminal、Raw YAML、Metrics、Secret value：**按需**。启动首页不得连接所有 Cluster、加载所有 Namespace、预载编辑器/终端/图表。

多集群只自动连接当前 Workspace 与用户 Pin 的集群。Watch 按打开的页面建立，并按 cluster+ns+resource 去重。

---

## Resource Budget

具体数字由 benchmark 修正。方向：

| 模块 | 约束 |
|------|------|
| JS Heap | 有界；1GB 日志不得整体进入 |
| Rust Core | 有界 cache；磁盘预算 + 低空间保护 |
| App diagnostics (`app.log`) | 14 天 / 500MB rolling；与 Pod 日志目录分离 |
| Log Buffer | UI 窗口固定上限 |
| Terminal | 同时 session 上限 |
| Monaco | 离开页面 dispose model |
| CPU | Regex/压缩不得长期占满；concurrency ≤ N |

冷启动目标方向：尽可能 < 2s。实时日志 30 分钟 UI 不明显膨胀。10 万行仍可交互。

---

## Cancellation / Lifecycle

Search、Download、Export、Logs、Watch、Exec、大 Manifest **MUST** 可取消并登记 TaskRegistry。

Leak 场景：开/关日志 100 次、终端 100 次、切集群 50 次。必须释放 task/channel/listener。xterm / Monaco dispose。一个 log task 失败不得拖垮其它 cluster session。

最小化：Download 继续；Log Follow 可配置；Terminal 继续。退出：cancel + flush + persist + timeout。
