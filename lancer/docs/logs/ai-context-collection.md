# AI Context Collection（边界）

## 目的

规定 **AI 如何从日志得到输入**，以及 **明确不做什么**。  
本阶段：只定边界；**不接模型、不写 AI Chat、不建统一日志领域模型**。

## 原则

```text
日志对人是 Runtime
日志对 AI 是 Context / Text
```

AI 不需要：

- `LogSession` / `LogLine` / `LogReference` 作为跨工具领域模型
- `LogProvider` / `LogEvidence` / Fingerprint 图谱
- 整份 managed-log 或 1MB 原文灌进 LLM

AI 需要：

- 一段**有边界**的文本
- **前后上下文**
- **少量来源元信息**（谁、何时、哪个容器）

## 采集，不是模型

每个工具自己的 Runtime；Lancer 只在「分析」时 **采集**：

```text
K8s Log Runtime          Docker Runtime         Jenkins Console
       │                       │                        │
       └───────────────────────┼────────────────────────┘
                               ↓
                    Context Collection（概念）
                               ↓
                         Text + 元信息
                               ↓
                              AI
```

**统一体验，不统一语义。** Docker / Jenkins 各自采法可以不同；不必先统一内部类型。

## K8s 采集形状（概念，本阶段可不落代码）

用户在 Viewer 中选中一段（或当前命中 + 上下文）：

```text
来源：
  connectionId / namespace / pod / container
  current | previous
  时间范围（选区首尾 timestamp，若有）

正文：
  前 N 行
  选中行
  后 N 行
```

拼成给模型的 **纯文本包** 即可，例如：

```text
Pod: order-service-7d8f9
Container: app
Time: 10:31:22 ~ 10:31:45

2026-10-08 10:31:22 INFO  ...
2026-10-08 10:31:24 ERROR connection refused: postgres:5432
...
```

实现上可叫 `getLogText(...)` 或等价；**从 read_window / 文件切片生成**，不要经 Universal Log Aggregate。

## 与 Search / Reference 的关系

- Runtime 内部用行号做 Search→Read 完全可以
- 那是实现细节，**不要**升级成给 AI 用的正式领域层
- 送给 AI 的永远是 **Text + 少量元信息**

## 以后（非本刀）

- 右键「分析这段日志」→ 采集 → 调模型
- Git / 代码上下文：在 Text 之外另采，再拼进 prompt（仍不是 Log Domain）
- Error fingerprint：Intelligence 层，建立在文本/堆栈解析上，不塞进 managed-log 核心模型

## 验收（文档级）

- 实现日志四刀时，PR 不得引入跨工具 LogProvider / 统一 LogSession 领域包「为了 AI」
- 若出现采集 API，输入是选区/行号范围，输出是字符串 + 扁平元信息

## 相关

- [ADR 0005](../adr/0005-large-log-architecture.md)
- [k8s-log-workbench.md](./k8s-log-workbench.md)
- [PRODUCT_MODEL.md](../PRODUCT_MODEL.md)
