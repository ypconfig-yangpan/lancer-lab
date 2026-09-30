# ADR 0011: Application Diagnostics Logging

## Context

需要区分 Desktop 应用诊断日志与被管理 Pod 的业务日志。需要 operationId、span、滚动文件、脱敏、前端有界上报。

## Decision

- Rust：`tracing` + `tracing-subscriber` + `tracing-appender`（daily rolling）
- 单文件流 `app.log*` + target 字段；不按子系统拆文件
- 保留 14 天且总容量 ≤ 500MB
- React：`src/shared/logger`；仅 error / 重要 warn / operation lifecycle IPC 到 Rust
- 生产默认 INFO，开发 DEBUG；V1 不上 ELK/Loki/Sentry/OTel Collector（代码不阻止未来 tracing→OTLP）

## Alternatives

- `log` + `env_logger`：缺 span / 字段上下文
- 每条前端日志落盘：IPC 风暴
- 按 kubernetes/terminal 拆文件：V1 过度

## Consequences

- 业务禁止 `println!` / `console.log`
- 必须维护 Redactor
- Panic hook 与 Error Boundary 写入同一诊断流
