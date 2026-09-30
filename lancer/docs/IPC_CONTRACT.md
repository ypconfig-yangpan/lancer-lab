# IPC Contract

React 不得散落 `invoke("...")`。一律走 `src/shared/tauri/*`。

## 路径

```
Request DTO (TS)
  → typed API (shared/tauri)
    → Tauri Command (薄适配)
      → Application Service
        → Result<T, AppError>
          → Response DTO / AppErrorDto
```

## 约定

| 项 | 规则 |
|----|------|
| 命名 | Command：`snake_case`（`list_pods`）；TS API：camelCase 方法 |
| JSON | Rust `#[serde(rename_all = "camelCase")]` |
| 成功 | 直接返回 DTO |
| 失败 | 返回 `AppErrorDto { code, message, detail, retryable }`；UI 按 `code` 展示 |
| 参数 | 单一 `input` 对象，避免多位置参数 |
| 凭证 | 默认不回传 Secret/Token；kubeconfig 用 path reference |
| 取消 | 长任务必须可取消（后续 stream/download/search）；V1 list 可先 timeout |
| progress | 长任务后续用 channel/event；禁止每行日志全局 emit |
| operationId | 长任务预留；短读请求可不带 |

## 错误码（起步集）

- `K8S_CONFIG_INVALID`
- `K8S_AUTH_FAILED`
- `K8S_UNREACHABLE`
- `K8S_PERMISSION_DENIED`
- `CLUSTER_NOT_CONNECTED`
- `NAMESPACE_REQUIRED`
- `POD_NOT_FOUND`

完整表见 `ERROR_CATALOG.md`（有则对齐，无则按本页扩展）。

## 禁止

- Command 内堆完整业务逻辑
- 把 kube-rs 原始类型无脑 serialize 给前端（Raw YAML 除外）
- 前端解析 Rust 原始 error string
