# 开发计划

可执行切片。阶段定义仍以 [ROADMAP.md](./ROADMAP.md) 为准。UI 以 [ui/README.md](./ui/README.md) 为准。

原则：一次只做一个切片；先读后写；先接上已有 IPC 再扩 Kind；不为 Application 导航提前做 Phase 4。

---

## 现在在哪

| 层 | 现状 |
|----|------|
| UI Stack | **已锁定** [ADR 0002](./adr/0002-react-ui-stack.md)：Tailwind/Radix/shadcn→`@lancer/ui`；禁 Ant/MUI |
| Shell | **已冻结**；`ShellModuleRegistry` 注册模块（非 Plugin） |
| 产品路径 | **Capabilities**（`connections` / `kubernetes` / `docker`）；无 Plugin Marketplace |
| 集群 / 日志 / Ops | Phase 1 读 + kube follow + Scale/Restart + Pod Exec |
| Docker Engine | list/logs/exec + Start/Stop/Restart/Remove；Images/Volumes list+delete；`dockerApi` |

**产品原则（PRODUCT_MODEL）：先集成，后抽象。** 产品路径 = Capabilities，不是 Plugin 平台。  
**架构：** [ADR 0017](./adr/0017-product-first-capabilities.md)；迁移已 **DONE**：[V2_PLUGIN_MIGRATION_AUDIT.md](./V2_PLUGIN_MIGRATION_AUDIT.md)。  
**下一步：** 加深 K8s/Docker 运维体验；**不做** Plugin Marketplace。

---

## 明确现在不做

Apply YAML、Agent、GitOps、SQLite、本机任意 shell、Telemetry、任意 Dock、第二套 UI 框架、**Plugin Marketplace / SDK / 新 Manifest·apply**。
（Pod log follow、Docker lifecycle/exec、Deployment Scale/Restart/UpdateImage/Delete、K8s Pod Exec 已不在此列。）

---

## Phase 1 切片（按顺序）

每片做完：对应 lint/test；错误码已在 [ERROR_CATALOG.md](./ERROR_CATALOG.md)；Loading / Empty / Error；Cluster + Namespace 始终可见。

### 1.1 真数据 Pod 列表（完成）

干什么：主工作区不再用 mock。选中 cluster/ns → Query `listPods` → 表格 + Inspector。

- 接 `use-cluster-connection` / `podApi`
- Sidebar：选 context、connect、切 namespace
- AppErrorDto 按目录展示，不弹 Debug 字符串
- mock 仅保留测试夹具

门禁：`pnpm tauri dev` 连本机 kubeconfig，能看到真实 Pod 名。

### 1.2 上下文条（Status 雏形）（完成）

干什么：危险操作之前先习惯「永远看见 Cluster / NS / 风险等级」。

- 低矮 Status 条：cluster、namespace、connected/stale、PROD 提示
- 不必先做完整 Activity Bar

对齐 [ui/LAYOUT_SYSTEM.md](./ui/LAYOUT_SYSTEM.md) Status Bar；顶栏只留标题 / 命令面板，上下文在底栏。

### 1.3 Deployment + Service 列表（完成）

干什么：Resources 专家视图的第二、三个 Kind。Summary DTO only。

- Rust Gateway + 薄 Command + Query Key（已有）
- 统一 ResourceListPane（Pods / Deployments / Services 切换）+ Inspector
- 显式 namespace；禁止意外 all-ns
- 挂在 `official.kubernetes` 插件 workspace contribution

### 1.4 Events（只读）（完成）

干什么：Bottom「Events」从占位改为只读列表。Event 是短期事实，不假装历史库。

- Rust Gateway + 薄 Command `list_events`；显式 namespace
- 打开 Bottom Events Tab 才 Query；Loading / Empty / Error
- Summary DTO only；按 lastTimestamp 新→旧

### 1.5 Watch（按需、去重）（完成）

干什么：打开列表页才 Watch；`cluster+ns+kind` 共享一条。断开重连 + backoff。Invalidate Query，不把对象复制进 Zustand。

- Rust `ResourceWatchManager`：`start_resource_watch` / `stop_resource_watch`，ref 计数去重
- kube `watcher` + `default_backoff`；断线指数退避重连
- Tauri event `k8s-resource-changed` → 前端 debounce invalidate Query
- disconnect cluster 时停止该 cluster 全部 watch
- Resources 当前 Kind + Bottom Events Tab 按需订阅

### 1.6 Raw YAML（懒加载）（完成）

干什么：Inspector / 独立 Tab 看 YAML。Monaco **打开才 load**。不要把 ManagedFields 默认推进 UI。

- Rust `get_resource_yaml`（Pod/Deployment/Service GET + serde_yaml）
- 返回前 `metadata.managedFields = None`
- Inspector Summary / YAML Tab；YAML Tab 才 fetch + dynamic import Monaco
- 只读；展示 resourceVersion

### 1.7 连接加固（完成）

干什么：Readonly 连接、SSAR（为以后按钮准备）、Stronghold 或明确「仅 path 引用 kubeconfig」。TLS insecure 必须醒目标识。

- Connect 默认 `readonly=true`；身份带回 `capabilities`（SSAR）
- UI 展示路径引用（`~/.kube/config`）与只读/TLS 标记；Status 条同步
- Rust `ensure_writable` + `CLUSTER_READONLY`；Stronghold 仍技术债

### 1.8 Shell 增量（完成）

- Preview Tab vs 固定 Tab（单击预览 / 双击固定；⌘W 关闭）
- 拆 `tabs-store` 与 chrome `workspace-store`
- Activity Bar 仅图标；Logs 进 Bottom；Settings 在底

---

## Phase 2 切片（按顺序）

### 2.1 LogSession + 有界窗口（完成）

干什么：UI 不再一次吃满 mock 数组；经 `apply` → `ctx.native.logs` 开 session、读 window。

- `LogSession` / `LogWindow` 实体
- 内存 mock engine（测试 / 非 Tauri 注入）
- `kubernetes.logs.*` apply + Logs pane 只持 ≤2k 行窗口

### 2.2a Disk-as-Source（完成）

落盘到 `app_data/managed-logs/`，文件名含 cluster/ns/pod/container/startTime；与 `app.log` 分离。
open 时写 seed JSONL（真 kube stream 下一刀）；`read_window` 只从磁盘切片。

### 2.2b 真 kube stream（完成）

bounded follow → 落盘 JSONL；`connectionId` + pod 名开流；pause/resume；`managed-log-appended` 通知 UI。无 connection / 带 `seed_lines` 仍走 2.2a seed。

---

## Phase 3 入口条件

日志可 follow/暂停。然后：Exec（xterm）、Scale/Restart/UpdateImage。每条写操作：`OperationId`、确认框带 Cluster/NS/资源、PROD Diff。

### 3.1 Deployment Scale / Restart（完成）

- Rust：`scale_deployment` / `restart_deployment`（`ensure_writable` + Patch；409 → `K8S_CONFLICT`）
- apply：`kubernetes.deployments.scale` / `restart`
- Inspector Actions：确认框展示 Cluster / NS / Diff；Readonly / SSAR 门闸；PROD 警告

---

## Phase 4

Application / Environment 导航。在此之前可用 Namespace + 标签权宜，**不要**先做完整应用中心。

---

## 建议执行顺序（近期）

```text
Shell ✅（冻结）+ ShellModuleRegistry
  ↓
Capabilities 替代 Plugin 平台 ✅（connections / kubernetes / docker）
  ↓
K8s 读路径 + log follow + Scale/Restart + Pod Exec ✅
  ↓
Docker Engine list/logs/exec/lifecycle ✅
  ↓
加深 K8s/Docker Ops（UpdateImage / Delete / dockerApi）← 下一步
  ↓
（不做 Plugin Marketplace）
```

### 3.2 K8s Pod Exec（完成 / v2）

- 路径：`capabilities/kubernetes` → `invoke(pod_exec_*)` → `PodExecManager`（**不经** plugin.apply）
- 门闸：`ensure_writable` + SSAR `can_create_pods_exec`
- UI：Bottom「Exec」+ xterm；命令「Kubernetes: Open Pod Exec」
- 审计 / ADR：[V2_PLUGIN_MIGRATION_AUDIT.md](./V2_PLUGIN_MIGRATION_AUDIT.md)、[ADR 0017](./adr/0017-product-first-capabilities.md)
