# Error Catalog

IPC 统一 `AppErrorDto`：`code`、`message`、`detail`（已 Redact）、`retryable`。

React **MUST NOT** 直接展示 Rust `Debug` / `anyhow` 字符串。新增 code 必须先改本表再改 Rust。

当前已实现的 code 与 `src-tauri/src/domain/error.rs` 对齐。标「计划」的尚未接线。

---

## Cluster（已实现）

| Code | Category | Meaning | Retryable | UI Behavior |
|------|----------|---------|-----------|-------------|
| CLUSTER_CONFIG_INVALID | Cluster | kubeconfig/context 无法解析 | no | 阻断连接 |
| CLUSTER_AUTH_FAILED | Cluster | 认证失败 | no | Fatal 当前连接 |
| CLUSTER_UNREACHABLE | Cluster | API Server 不可达 | yes | Recoverable；STALE |
| CLUSTER_TLS_FAILED | Cluster | TLS 校验失败 | no | 阻断；禁止默默 insecure |
| CLUSTER_NOT_CONNECTED | Cluster | 尚未 connect 或已 disconnect | no | 引导先连接 |
| CLUSTER_READONLY | Cluster | 以 Readonly 模式连接后拒绝写操作 | no | 已实现（ensure_writable） |

---

## Kubernetes

| Code | Category | Meaning | Retryable | 状态 |
|------|----------|---------|-----------|------|
| K8S_FORBIDDEN | Kubernetes | RBAC 拒绝 | no | 已实现 |
| K8S_NOT_FOUND | Kubernetes | 资源不存在 | no | 已实现 |
| K8S_API_ERROR | Kubernetes | 其它 API 错误 | 视 status | 已实现 |
| K8S_CONFLICT | Kubernetes | resourceVersion 冲突 | no* | **已用**（写路径 409） |
| NAMESPACE_REQUIRED | Kubernetes | Query/Command 缺显式 namespace | no | 已实现 |

\*冲突必须重读 → Diff → 提示，禁止静默覆盖。

---

## Docker Engine（本机 socket）

| Code | Category | Meaning | Retryable | 状态 |
|------|----------|---------|-----------|------|
| DOCKER_UNAVAILABLE | Docker | 无法连接 Engine（无 socket / OrbStack 未开） | yes | 已实现 |
| DOCKER_ENGINE_FAILED | Docker | Engine API 其它错误 | yes | 已实现 |

---

## Logs / Terminal / Filesystem / Credential（计划，Phase 2–3）

| Code | Category | Retryable |
|------|----------|-----------|
| LOG_STREAM_FAILED | Logs | 视原因（**已用**：落盘 IO / 未 init） |
| LOG_STREAM_INTERRUPTED | Logs | yes |
| LOG_FILE_NOT_FOUND | Logs | no（session miss / 缺文件：**已用**） |
| LOG_DISK_FULL | Logs | no（**已用**：ENOSPC） |
| LOG_SEARCH_FAILED | Logs | no |
| TERMINAL_OPEN_FAILED | Terminal | no（**已用**：Docker / **K8s Pod** exec open） |
| TERMINAL_DISCONNECTED | Terminal | yes（**已用**：Docker / **K8s Pod** exec write/resize/miss） |
| TERMINAL_PERMISSION_DENIED | Terminal | no（**已用**：K8s readonly / SSAR pods/exec / 403） |
| FILE_READ_FAILED | Filesystem | no |
| FILE_WRITE_FAILED | Filesystem | no |
| FILE_PERMISSION_DENIED | Filesystem | no |
| CREDENTIAL_INVALID | Credential | no |
| CREDENTIAL_NOT_FOUND | Credential | no |

---

## Plugin / Native（前端 PluginResponse / NativeCapability；分阶段接线 IPC）

| Code | Category | Meaning | Retryable | 状态 |
|------|----------|---------|-----------|------|
| PLUGIN_INACTIVE | Plugin | 插件未 active 或不接受 request | no | 已实现（Manager.apply） |
| PLUGIN_NO_APPLY | Plugin | 插件未实现 apply() | no | 已实现 |
| UNKNOWN_TYPE | Plugin | apply request.type 未知 | no | 已实现（mock） |
| NATIVE_UNAVAILABLE | Native | `ctx.native` 能力尚未接线 | no | 已实现（门面 stub） |
| NATIVE_FORBIDDEN | Native | 能力被产品策略禁止（如任意 host shell） | no | 已实现 |
| NATIVE_BRIDGE_FAILED | Native | native 桥接调用失败 | yes | 已实现 |
