# History → Live Resume（历史与实时衔接）

## 目的

回答：开机先拉一段历史，再挂上 live stream，**如何保证对得上、不丢、不乱、不重复**。

这是 K8s Log Runtime 的核心正确性文档，不是 UI 文档。

## 问题

朴素实现：

```text
tail 历史 N 行 → 显示
同时 follow → 追加
```

在以下情况会错：

- 历史与 follow 重叠（同一行出现两次）
- 网络闪断后重连，重复或空洞
- 容器重启后仍用旧 stream（应 Previous / 新 containerId）
- 用 **前端 lineNumber** 当游标：换 session、截断、重开后失效

## 决策：Stream Cursor（不用 UI 行号）

权威游标（逻辑名 `LogStreamCursor`，实现可用结构体/字段集合）：

```text
clusterId / connectionId
namespace
pod
container
containerId      ← 区分重启前后
lastTimestamp    ← kube timestamps=true 时的 RFC3339（或等价）
```

可选辅助（非权威）：

- `lastRawLineHash`：时间戳相同或缺失时的去重辅助
- session 内 `lineNumber`：仅用于**当前 Disk-as-Source 文件内**定位与搜索命中，**不得**当作跨重连、跨容器的游标

## 流水线

```text
Open
  ↓
History（since / tail / previous 由 open 参数决定）
  ↓
写入 managed-log（Disk-as-Source）
  ↓
建立 / 更新 Cursor（最后一行的 containerId + lastTimestamp）
  ↓
Live Follow（同一 containerId）
  ↓
每条 live 行：
  Overlap? → Dedup 丢弃
  否则 Append → 更新 Cursor
  ↓
UI read_window（只读盘上窗口）
```

### Overlap / Dedup

- History 与 Follow 交接：Follow 侧丢弃 `timestamp <= cursor.lastTimestamp` 且内容重复的行（或 hash 命中）
- 允许小窗口 Overlap 拉取（若 API 支持），以 Cursor 为准裁剪，而不是「盲接」
- 无 timestamp 的行：仅依赖顺序 + hash；标记 UI「部分行无时间戳」

### Reconnect

1. 记录当前 Cursor  
2. 中断 follow  
3. 用 Cursor 恢复：优先 `sinceTime = lastTimestamp`（减一点 epsilon 做 overlap），再 Dedup  
4. 若 `containerId` 变化 → **新运行实例**，不得 silently 续在同一逻辑流；应提示或切换 Previous/Current

### Pause

- Pause：停止向 UI 推进 / 或停止消费展示；Cursor 与落盘策略实现可选「仍写入磁盘」或「暂停写入」——推荐 **仍落盘、UI 暂停跟随**，以免丢实时数据
- Resume：从当前文件尾 `read_window`，不必重拉全历史

## 与 Session 文件的关系

- 一次 UI open ≈ 一个 managed-log 文件 + 一个进行中的 stream
- 换 Pod / Container / Previous / Since / Tail → **新文件、新 Cursor 序列**
- 文件内 `lineNumber` 从 1 递增且不可重编号（见 storage-and-index）

## 验收

- 历史尾与 live 头无重复刷屏
- 断网重连后无大块重复；Cursor 基于 timestamp(+hash)
- 容器重启后不把新旧日志 silently 拼成「同一条连续流」而不改 containerId
- 前端清屏 / 换行号过滤不影响 Cursor

## 相关

- [storage-and-index.md](./storage-and-index.md)
- [k8s-log-workbench.md](./k8s-log-workbench.md)
