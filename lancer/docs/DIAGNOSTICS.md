# Diagnostics（应用诊断日志）

本文约束 **Lancer Desktop 自己的运行日志**，不是被管理 Pod 的业务日志。Pod 日志架构见 [PERFORMANCE.md](./PERFORMANCE.md) 与 ADR 0005。

---

## 两层

```
React / TypeScript     前端开发日志（统一 logger）
        ↓ 仅 error / important warn / operation lifecycle
Tauri IPC              reportFrontendLog（薄 Command）
        ↓
Rust tracing           真正应用运行日志
        ↓
AppData/logs/app.log*  滚动文件（Diagnostics 打包源）
```

| 层 | 组件 | V1 不用 |
|----|------|---------|
| Rust | `tracing` + `tracing-subscriber` + `tracing-appender` | `println!` / `log` + `env_logger` 作为正式方案 |
| 文件 | daily rolling + 保留天数/总容量 | `kubernetes.log` / `terminal.log` 拆文件 |
| 前端 | `src/shared/logger` | 业务里 `console.log` |
| Crash | panic hook + React Error Boundary | 无痕迹退出 |
| 遥测 | 结构上可接 `tracing` → OTLP | ELK / Loki / Sentry / OTel Collector |

---

## 目录与滚动

```
{app_log_dir}/
├── app.log
├── app.log.2026-09-01
└── ...
```

单流 + `target` / module 字段筛选（例如 `lancer::kubernetes`）。**MUST** daily rolling。**MUST** 清理：保留 **14 天** 且总容量 **≤ 500MB**（先删最旧）。诊断日志不必长期保存。

---

## 级别

`TRACE` / `DEBUG` / `INFO` / `WARN` / `ERROR`

| 环境 | 默认 |
|------|------|
| 生产 | INFO（`RUST_LOG` 可覆盖） |
| 开发 | DEBUG |
| 深度排查 | TRACE，禁止默认长期打开 |

**INFO：** 启动、cluster connected、download start/complete、scale succeeded、terminal open/close。  
**不要 INFO：** 每次 `listPods()`。普通 API → DEBUG，或只在慢请求/错误时记。

---

## Rust

禁止业务路径 `println!` / `eprintln!`。

```rust
tracing::info!(cluster_id = %cluster_id, "connecting to kubernetes cluster");
```

写操作用 `#[tracing::instrument]` + **`operation_id`**、`cluster_id`、`namespace` 等字段。禁止 `error!(?config)` 一类可能含 token 的整对象。

```rust
#[tracing::instrument(skip(self), fields(operation_id, cluster_id = %cluster_id, namespace = %namespace))]
pub async fn scale_deployment(...) -> Result<(), AppError> { ... }
```

panic hook：tracing ERROR + `crash.marker`。下次启动 **MUST** 提示「上次应用异常退出」，并提供导出诊断入口（打包实现可后补，路径由 `app_health.logDir` 给出）。

---

## React

`logger.trace|debug|info|warn|error`。DEV 可打 DevTools。PROD 普通 debug **不写文件**。

IPC 上报 **MUST** 仅：`error`、重要 `warn`、operation lifecycle。禁止每条 UI debug IPC。

---

## Operation ID

用户一次写意图生成 `operation_id`（`OperationId::generate()`，形如 `op_<millis>_<seq>`）。该次 connect / scale / export 的 tracing 字段必须带上，便于导出诊断后按 id 过滤。

---

## 脱敏

见 [SECURITY.md](./SECURITY.md)。所有写入文件的字符串经 `SecretRedactor`。

---

## Diagnostics 包

导出：滚动 app 日志、operation 史、非 secret settings、cluster metadata、error traces。不含 token / secret / private key。V1 无行为 Telemetry。

当前可列出文件：`list_diagnostic_log_files`；完整 zip 打包后补。`app_health.logDir` 给出目录。
