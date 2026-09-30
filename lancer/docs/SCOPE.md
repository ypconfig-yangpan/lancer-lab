# Scope Freeze

冻结日期：2026-09-01。再改 Scope 必须明确声明，禁止悄悄扩大。

## V0 — Foundation（已完成 / 准入基线）

- Tauri Shell
- React IDE Layout
- Rust IPC 骨架
- Mock Pod Table
- Virtual Log Viewer（有界 buffer）
- 质量闸门脚本（typecheck / lint / test / fmt / clippy）

## V1 — Kubernetes Read（当前开发目标）

纵向切片优先：

1. 导入 / 选择 kubeconfig context
2. 连接 Cluster（ClusterId + CA fingerprint + TLS 标记）
3. Namespace 列表
4. Pod List（主表已接 IPC，不再用 mock 作为默认数据）
5. Pod Details
6. 再扩：Deployment / Service / Events（list 已接）/ Raw YAML（懒加载）

V1 仍是 **Query only**。

## 当前明确不做

- Live Pod Logs / 下载 / 搜索 / Multi Pod
- Terminal / Exec
- Scale / Restart / Apply / 任何写操作
- Agent / Always-on collector
- GitOps / Helm 完整运维
- 监控平台 / 告警平台
- 本机任意 Shell
- SQLite
- 生产集群当日常 GUI 调试环境

## Spike 准入（进入 V1 真连接前）

1. React ↔ Rust IPC（含 `AppErrorDto`）
2. Rust 连真实 K8s：list namespace / pod
3. 大日志分块读取 + Virtual List（可在 V1 Read 后、V1 Logs 前完成）

## 固定测试环境

使用本机 `k3d`/`kind` 夹具（见 `fixtures/k8s/`），禁止长期拿生产 / 共享测试机调 GUI。
