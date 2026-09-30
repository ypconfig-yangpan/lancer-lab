# Roadmap

编号以 **Phase 0–6** 为准。Agent = Phase 5。

---

## 当前状态（2026-09-29）

**Phase 0 Foundation 已完成。** Phase 1 Read **基本完成**。Shell **已冻结**。

**当前刀：** 加深 K8s / Docker 运维（连接→浏览→操作→日志→Exec），走 **Capabilities + ShellModuleRegistry**。  
产品模型：[PRODUCT_MODEL.md](./PRODUCT_MODEL.md)；架构决策：[ADR 0017](./adr/0017-product-first-capabilities.md)。  
去 Plugin 迁移：**DONE** — [V2_PLUGIN_MIGRATION_AUDIT.md](./V2_PLUGIN_MIGRATION_AUDIT.md)。

**不是** Plugin Runtime / Marketplace / `official.mock` 验收刀。禁止新 Manifest、`apply`、PluginManager。

已允许（相对早期禁令）：K8s 读路径、部分写（Scale/Restart）、Pod log follow、Pod Exec、Docker list/logs/exec/lifecycle。  
仍禁止：Agent、GitOps、SQLite、本机任意 shell、Telemetry、Plugin 平台。

近期怎么拆任务：[DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)。

---

## Phase 0 — Foundation（已完成）

Tauri 2、React、Rust、Design System、typed IPC、Mock/Virtual Log Viewer、应用诊断日志（tracing）。

---

## Phase 1 — Kubernetes Read（基本完成）

已有：Cluster Connection、Namespace、Pod / Deployment / Service 列表（Query + Watch）、底栏 Events、Inspector Raw YAML、Status。

未完：Stronghold（凭证仍为 kubeconfig path reference）。Readonly / SSAR 已接通。

---

## Phase 2 — Logs（核心已通）

Live follow / 有界窗口 / Disk-as-Source。LogSession。与 Desktop `app.log` 诊断日志分开。其余（Search / Regex / Multi Pod…）按需加深。

---

## Phase 3 — Operations（进行中）

Exec、Scale、Restart、Update Image、Delete Deployment 已有；本机任意 shell 仍禁止。走 Capability API，不经 apply。

---

## Phase 4 — 以后再抽象

Application / Environment 等 **不先验空造**；用顺工具后再从行为长模型。见 PRODUCT_MODEL。

---

## Phase 5 — Cluster Agent（禁止提前实现）

---

## Phase 6 — GitOps（禁止提前实现）

---

## 当前明确禁止提前实现

Cluster Agent、GitOps、CI/监控/告警/**Plugin 平台**、SQLite、Redux/XState/RxJS、本机任意 Shell、用户行为 Telemetry、隐式 Reconcile Loop、写路径 JSON Patch 从 UI 直送、新 Manifest / `shell.apply`。
