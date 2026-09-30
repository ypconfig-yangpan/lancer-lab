# Lancer Architecture

Lancer 是 Desktop First 的 DevOps / Kubernetes **Operations IDE**，不是 Web Admin，也不是 Kubernetes Resource Browser。产品领域见 [PRODUCT_MODEL.md](./PRODUCT_MODEL.md)。

第一阶段 **无中心 Server**。Desktop 经 **`ClusterClientRegistry`**（直连 kube-rs）连接 Kubernetes API。文档旧称 `ClusterGateway` **尚未落地为 trait**；未来 Agent 再议。产品路线见 [ADR 0017](./adr/0017-product-first-capabilities.md)（Product-first Capabilities；插件平台路线已 supersede）。

规则级别与写路径见 [ENGINEERING_CONSTRAINTS.md](./ENGINEERING_CONSTRAINTS.md)。状态细则见 [ARCHITECTURE_RULES.md](./ARCHITECTURE_RULES.md)。

---

## Product Architecture

```
DevOps Desktop
│
├── LancerApp (Composition Root)   生命周期指挥家：子系统 start/stop 顺序 + onBeforeShutdown
│     diagnostics → i18n → query → plugin-kernel → workspace-chrome
│
├── Desktop Shell          布局、Activity Bar、Tabs、Command Palette、Status Bar（React 是视图层）
│
├── Plugin Kernel          PluginManager / Lifecycle / Context / Scope / Registries
│     └── JS Extension Host（目标：共享、懒启动；V1 可同进程）  Plugin backend / apply
│
├── Platform Services      Command / View / Session / …（插件只拿 Scoped API）
│
├── Plugins                official.kubernetes / official.mock / …（默认 TypeScript）
│     ├── UI Side          React contributions
│     └── Extension Side   provider / mapping / apply
│
├── Tauri IPC              类型化边界：优先经 PluginContext native 门面，避免插件硬编码 command 名
│
└── Rust Kernel            Native Accelerator（非每插件必选 Backend）
      │
      ├── Native Services  Process / FS / Logs / PTY / Search / Compression / Credentials / …
      ├── Kubernetes       ClusterGateway 等 Native 路径（经官方插件触发；普通 API 可迁 Extension TS）
      ├── Filesystem       日志文件、settings 原子写、诊断包
      └── Future Agent Gateway   预留 Port；V1 不实现
```

**LancerApp 铁律：** 对插件不可见（插件只有 `PluginContext`）；不做属性袋 / Service Locator；只管顺序与窄门面。关窗走 `shutdown()` → 前端 `app_prepare_shutdown` + Rust `RunEvent::Exit` 安全网。未来 LogWorkspace / OperationPipeline 以 `AppSubsystem` 挂入同一棵树。

应用生命周期与 Composition Root 规格：[APPLICATION_LIFECYCLE.md](./APPLICATION_LIFECYCLE.md)。插件运行时见 [PLUGIN_RUNTIME.md](./PLUGIN_RUNTIME.md)（[ADR 0012](./adr/0012-plugin-runtime.md) Kernel + [ADR 0013](./adr/0013-typescript-first-plugin.md) TypeScript First）。插件 UI 展示契约见 [PLUGIN_VIEW_CONTRIBUTION.md](./PLUGIN_VIEW_CONTRIBUTION.md)（[ADR 0014](./adr/0014-plugin-view-contribution.md)）。产品路线与 Provider/Experience 见 [PLUGIN_PRODUCT.md](./PLUGIN_PRODUCT.md)（[ADR 0015](./adr/0015-official-first-plugin-product.md)）。原则：Core owns platform/layout/presentation；Plugin owns DevOps capability / descriptors + data；**TypeScript 为插件默认语言，Rust 为 Native Accelerator**；**Official-first，能力全是 Plugin**。

| 部分 | 负责 | 不负责 |
|------|------|--------|
| React / Plugin UI | UI、交互、Query cache 展示、URL、局部 state | Provider auth、CLI、凭证、无约束 FS、K8s 协议、大日志全文 |
| JS Extension Host（目标） | `apply()`、Provider / REST / SDK、编排与 mapping | 像素级 UI；巨量日志生命周期 |
| Tauri IPC | 薄 Command、typed DTO、stream/channel 句柄；由 native 门面消费 | 业务编排、kube-rs 类型泄漏；插件硬编码散落 command 名 |
| Rust | Native / 安全 / 吞吐敏感：FS、大日志、搜索、Regex、压缩、凭证、PTY、Process、必要的 K8s watch/stream | 像素级 UI、Design Token；普通 Provider 默认实现语言 |
| Kubernetes API | 运行时事实 | 不是永久日志库、不是 Desktop 数据库 |
| 本地文件系统 | 大日志源、有界 cache、settings、operation 本地史 | 不得无限增长；不得存 Secret value |
| Cluster Agent（Phase 5） | Desktop 离线时仍需持续的采集/上报 | 不得推翻 Desktop 直连；不得让 UI 绑死 Direct client |

**依赖方向（禁止反向）：**

```
React (UI Layer)
  ↓ Typed Tauri API (src/shared/tauri)
    ↓ Tauri Commands (adapter)
      ↓ Application Service (Query / Command)
        ↓ Infrastructure Adapter (ClusterGateway, FS, CredentialStore)
          ↓ Kubernetes API | Disk | Stronghold | (future) Agent
```

- UI 不 import kube-rs 概念。
- Application 不依赖 WebView / React。
- Infrastructure 实现 `ClusterGateway`；V1 = `DirectClusterGateway`。Phase 5 增加 `AgentClusterGateway`，Application 调用不变。

---

## Layering（代码）

**UI Layer**

```
src/
  app/           bootstrap、providers、Error Boundary
  routes/        TanStack Router
  features/      纵向切片（cluster-connect、pod-logs、deployment-scale…）
  entities/      PodView / DeploymentView（非 kube 原始对象）
  shared/        typed tauri、query keys、i18n、真正通用 lib
  components/ui/ Design System（shadcn）
```

**Application Layer（Rust）**

Use case：`list_pods`、`scale_deployment`、`stream_pod_logs`。表达用户意图，不堆 UI 细节。为未来 `Command → ChangeSet → Executor` 留边界。

**Infrastructure Layer**

`ClusterGateway`、Filesystem、CredentialStore、Clock。领域层不直接依赖 kube-rs 类型作为长期 API。

---

## Read / Write Model

| 方向 | 例子 | 规则 |
|------|------|------|
| Query | `listPods`、`getDeployment`、`getEvents` | 无副作用；List 返回 Summary |
| Command | `scaleDeployment`、`restartDeployment`、`updateImage` | 表达意图；禁止模糊 `saveDeployment`；禁止把完整 JSON Patch 从 React 扔给 Rust（Raw YAML 例外） |

写路径（Phase 3+）：Validate → Dry Run → Diff → Apply。结构化修改优先 Patch；Conflict 不得静默覆盖。详见 ENGINEERING_CONSTRAINTS。

---

## State Ownership

| 所有者 | 保存什么 | 不保存什么 |
|--------|----------|------------|
| TanStack Query | Remote：Cluster 列表摘要、NS、Workload、Events（cache/retry/stale） | 完整 GB 日志、Secret value、UI 布局 |
| Zustand | UI：workspace 选择、tabs、panel、theme、palette、log viewer 偏好 | Pods 列表副本、K8s 对象 |
| Router URL | 可恢复位置：cluster / namespace / resourceType / name / tab | 复杂业务对象 |
| React local | 组件瞬时 UI | 跨页事实 |
| RHF + Zod | 复杂表单 | 提交成功后 invalidate Query，不手工改几十处 |
| Rust | Client Registry、TaskRegistry、Stream/Terminal session、operation 执行 | 全部 Pods、全部 Logs、全部 UI |
| Disk | 日志文件、settings、本地 operation 史、有界 cache | Credential、everything.json |

Derived state 当场计算。Stream（Logs / Events Watch / Terminal）**不是**普通 Query。

---

## Streaming Architecture

Logs、Events（watch）、Terminal、K8s Watch 使用 **Session + bounded channel**，因为：

- 持续时间长、可取消、有背压；
- 数据量无上界；不能进 JSON IPC 一次拉完；
- 重连、重复、丢失必须可见。

模型：`StreamSession`（id、status、source、cursor、cancellation）。日志：Disk as Source + React viewport。Watch：List → resourceVersion → Watch → Delta；断开重连。禁止用 Query 每秒轮询假装实时日志。

---

## Future Agent Architecture

```
V1:     UI → Application → DirectClusterGateway → Kubernetes
Later:  UI → Application → AgentClusterGateway → Agent → Kubernetes
```

约束：

- Application 只依赖 `ClusterGateway` 能力（list/watch/logs/exec/apply）。
- UI 不出现 `if (agent)` 分叉业务。
- Phase 5 再做 Capabilities handshake。V1 **禁止实现 Agent**。
- Desktop 新版本不得默认要求 Agent 同步升级（有限兼容窗口，Phase 5 ADR）。

---

## IDE Layout（Phase 0–1）

当前实现：

```
┌ Sidebar ┬ Main Workspace ┬ Detail Panel ┐
│ Cluster │ Tabs           │ Resource     │
│ Apps/NS │                │ Detail       │
├─────────┴────────────────┴──────────────┤
│ Logs / Terminal / Events Bottom Panel   │
└─────────────────────────────────────────┘
```

目标 Shell（Activity Bar / Status Bar / Preview Tab）见 [ui/LAYOUT_SYSTEM.md](./ui/LAYOUT_SYSTEM.md)。V1 不做任意 Dock。日志是一级能力（LogWorkspace），不是 Pod 页 textarea。

---

## 安全摘要

Credential → Stronghold（**尚未接入**；当前 kubeconfig 文件路径）。禁止本机任意 shell。Diagnostics 必须 Redact。详见 [SECURITY.md](./SECURITY.md)、[THREAT_MODEL.md](./THREAT_MODEL.md)。

---

## 相关文档

- [PLUGIN_RUNTIME.md](./PLUGIN_RUNTIME.md)
- [PRODUCT_MODEL.md](./PRODUCT_MODEL.md)
- [DIAGNOSTICS.md](./DIAGNOSTICS.md)（Desktop 应用日志，不是 Pod 日志）
- [TECH_STACK.md](./TECH_STACK.md)
- [CODING_STANDARDS.md](./CODING_STANDARDS.md)
- [SECURITY.md](./SECURITY.md)
- [PERFORMANCE.md](./PERFORMANCE.md)
- [ERROR_CATALOG.md](./ERROR_CATALOG.md)
- [THREAT_MODEL.md](./THREAT_MODEL.md)
- [BENCHMARK_PLAN.md](./BENCHMARK_PLAN.md)
- [ROADMAP.md](./ROADMAP.md)
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md)
- [ARCHITECTURE_RULES.md](./ARCHITECTURE_RULES.md)
- [ENGINEERING_CONSTRAINTS.md](./ENGINEERING_CONSTRAINTS.md)
- [UI_GUIDELINES.md](./UI_GUIDELINES.md) / [ui/](./ui/README.md)
- [technical-debt.md](./technical-debt.md)
- [adr/](./adr/)
