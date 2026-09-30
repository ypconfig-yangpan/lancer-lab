# ADR 0006: Local Security

## Context

Cluster Token 等敏感信息不能进前端存储或明文配置。同时需要持久化窗口状态与偏好。

## Decision

- Credential：Tauri Stronghold（或等价安全存储）
- UI Preference / Recent Clusters：Tauri Store + Files
- V1 不引入 SQLite（需时另开 ADR）
- App Data 使用 OS 标准路径，不硬编码 `~/.<product>/`（该路径仅作概念示意）
- Capability 最小权限；Shell V1 默认关闭；Terminal 走 K8s Exec

## Alternatives

- localStorage / 明文 JSON：不可接受。
- V1 即 SQLite：过早，增加攻击面与迁移成本。

## Consequences

- kubeconfig 优先 Path Reference。
- Diagnostics 导出必须过滤 Credential。
- Phase 0 可先放 Store 骨架，Stronghold 在接入真实连接前落地。
