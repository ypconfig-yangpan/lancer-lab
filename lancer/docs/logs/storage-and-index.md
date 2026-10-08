# Log Storage and Sparse Index

## 目的

本地 Disk-as-Source：JSONL 落盘、稀疏行偏移、窗口读、保留策略。  
支撑「日志从 1 万到 100 万行，读尾窗不线性恶化」。

与 Desktop `app.log`（ADR 0011）目录分离：业务日志在 `app_data/managed-logs/`。

## 格式

- 每行一条 JSON（JSONL），字段至少能还原展示所需：`lineNumber`、`message`，可选 `timestamp`、`level`、`pod`、`container` 等
- `level` / `timestamp` **可以缺失**（解析失败则省略，勿强行填 UNKNOWN 当真理）
- 同一 open session 一个主文件；文件名建议含 cluster/ns/pod/container/startTime 便于人读

## 稀疏索引（Sparse Index）

与 Search 的关系：索引回答「已知行号如何快速读到」；Search 回答「关键词在哪」。见 [search-architecture.md](./search-architecture.md) §9。  
**Read 路径优先落地索引**（修现有 `read_window` 从头扫）；Search 第一阶段可用顺序扫 + ripgrep crates，命中后再走索引 seek。

**做：**
```text
每约 1000 行记录：
  lineNumber → byteOffset

读 line L：
  找最大 index 键 ≤ L
  seek(byteOffset)
  顺序扫描到 L
```

**不做（第一阶段）：**

- B+Tree、SQLite FTS、Elasticsearch、独立索引进程、全文倒排

索引可存：

- 同目录旁路 `.idx` 文件，或
- 进程内 `Vec<(u64, u64)>` + 定期 flush

写路径：追加 JSONL 时同步更新索引（每 N 行记一个锚点）。

## Window Read

```text
read_window(sessionId, offset, limit)
  → 用索引 seek
  → 返回最多 limit 行（上限如 10_000）
```

禁止：每次从文件头 `enumerate` + skip（当前实现债务，必须修）。

UI / 轮询只拉**尾窗**或**跳转窗**，不把整文件灌进 React。

## Retention

- close session：**可不立即删文件**（便于导出/回顾）
- 全局清理：启动时或定时，按 **天数 + 总字节上限** 删除最旧 managed-log（及对应 `.idx`）
- 清理**不得重编号**未删文件内的 lineNumber

## 生命周期

```text
open → 建文件 + 索引
append（history / follow）→ 更新 totalLines + 索引锚点
read_window / search / export → 只读
close → 停 stream；文件保留至 retention
```

## 验收

- 尾窗读取在 10 万 / 100 万行量级延迟可接受（不随文件线性扫全文件）
- 磁盘占用被 retention 约束
- 导出全量文件行数 ≈ session `totalLines`

## 相关

- [search-and-window-read.md](./search-and-window-read.md)
- [ADR 0005](../adr/0005-large-log-architecture.md)
