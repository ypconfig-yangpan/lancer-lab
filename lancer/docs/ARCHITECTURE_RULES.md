# Architecture / State / Design Pattern Rules

本文件约束 Lancer **架构设计**，不仅是编码风格。Cursor 规则镜像：仓库根 `.cursor/rules/lancer-architecture*.mdc`、`lancer-state*.mdc`、`lancer-runtime*.mdc`。工程补充（MUST/SHOULD/MAY）：[ENGINEERING_CONSTRAINTS.md](./ENGINEERING_CONSTRAINTS.md)。产品概念：[PRODUCT_MODEL.md](./PRODUCT_MODEL.md)。阶段：[ROADMAP.md](./ROADMAP.md)（Agent = Phase 5，不是旧 P3）。

目标：避免巨大 Store、逻辑全进 Component、巨大 Rust AppState、页面隐式耦合、过度设计。保持 Desktop-first、Kubernetes-first、性能优先。

**级别：** 本文未单独标注的条目默认 **SHOULD**（架构偏好）。与 `ENGINEERING_CONSTRAINTS.md` 的 **MUST** 冲突时以 MUST 为准。优先级：Security > Data Integrity > Correctness > Performance > Maintainability > Developer Convenience。

新代码遵守本规则。不为统一风格无意义重写。重构保持行为不变。规则明显不适用时先写 ADR。

---

## 状态分类

所有状态必须先分类，再决定存储位置。禁止「不知道放哪里就放 Zustand」。

| 类别 | 位置 |
|------|------|
| Remote State | TanStack Query |
| UI State | 按领域拆分的 Zustand |
| Form State | React Hook Form + Zod |
| URL / Navigation | Router / Search Params |
| Native State | Rust（Client、Task、Session） |
| Persistent Local | 分类存储（见下文） |
| Streaming State | Stream Session，不是普通 Query |
| Derived State | 计算，不进 Store |

### Remote State

Cluster、Namespace、Deployment、Pod、Service、Ingress、ConfigMap、Event、Kubernetes Resource、Registry Image、Git Repository：统一 TanStack Query（loading / error / retry / cache / stale / refetch / invalidation / cancellation）。

禁止 `podsQuery → setPods → Zustand`。正确：Query → Component / Selector。

Query Key 必须集中管理（`clusterKeys` / `podKeys` / `deploymentKeys`）。禁止页面手写 `["pods", cluster, namespace]`。

`staleTime` 按实时性：Pod 短、Deployment 中、Cluster metadata 长。日志流不要用普通 Query 模拟持续 Stream；Watch / Stream 单独处理。

### UI State

Zustand 仅负责 UI：`currentWorkspace`、`currentCluster`、`currentNamespace`、`selectedResource`、`openTabs`、`activeTab`、面板尺寸、theme、commandPalette、logViewerPreference。

Store 按领域拆：`workspaceStore`、`layoutStore`、`tabsStore`、`preferencesStore`。禁止 `globalStore.ts` 塞整个项目。

Component 必须 selector：`useWorkspaceStore(s => s.activeClusterId)`。禁止 `useStore(state => state)`。

Derived State 不进 Store。不要同时保存 `pods` 与 `filteredPods`。

### Form / Navigation

复杂表单：RHF + Zod。提交成功后 `invalidate` Query，不手工改几十处 State。Optimistic Update 只在体验明显受益处使用。Kubernetes **高风险写操作默认不 Optimistic**。

可分享、可恢复的页面状态放 URL：cluster、namespace、resourceType、resourceName、tab。例如 `/clusters/test/namespaces/default/pods/iam-xxx?tab=logs`。不要把所有页面位置只存在 Zustand。

### Streaming / 日志

日志、Events、Terminal 用 `StreamSession`（id、status、startedAt、source、cursor、cancellation）。生命周期：Created → Connecting → Streaming → Paused → Closed / Failed。禁止用 Query 每秒轮询模拟实时日志。

日志：Disk as Source + Bounded UI Buffer。`LogSession`（fileId、source、offset、follow、filters、status、stats）。React 中的 logs 只是 viewport，不是完整日志。未来预留 `LogWorkspace`（Sources / Files / Filters / Search / Bookmarks / Export）。

### 状态机

复杂生命周期必须显式 Discriminated Union：Cluster Connection、Log Stream、Terminal、Rollout、Download、Export、Agent Connection。禁止多 boolean 拼状态。V1 不强制 XState；复杂度超过明确阈值后才 ADR。

---

## 领域与前端结构

产品核心不是 Kubernetes Resource。核心领域：Workspace、Cluster、Application、Environment、Release、Resource、LogSession、TerminalSession、Change。Kubernetes 属于 Infrastructure / Runtime。UI 不要整盘围绕 Kind 设计。产品术语优先 Application / Environment / Release；ReplicaSet / EndpointSlice 等进 Advanced View。

Feature-first + Vertical Slice：`features/cluster-connect/`、`pod-logs/`、`deployment-scale/` 等，内含 ui / model / api / schema / hooks。避免顶层 `services/`、`hooks/`、`utils/`、`components/` 全塞。通用能力进 `shared`。

---

## 读写真相与模式

CQRS：Query（`listPods`、`getDeployment`）无副作用。Command（`scaleDeployment`、`restartDeployment`）表达用户意图，不承担复杂读取聚合。禁止模糊的 `saveDeployment()`。不要把完整 JSON Patch 从 React 发给 Rust（Raw YAML Expert Mode 例外）。

即使 V1 无 Server，Rust Application Service 不要被 UI 细节绑死，为未来 `User Action → Command → ChangeSet → Executor` 留接口。

Adapter：K8s / Git / Registry / Filesystem / CredentialStore。领域层不直接依赖 kube-rs。仅在边界需要替换/测试时抽 Trait（如 `WorkloadGateway`），避免 Interface 爆炸。Facade（`KubernetesFacade`、`LogFacade`）对 UI 隐藏 Pod/Watch/Exec/Discovery 细节。

不要机械 Repository。K8s 远端资源优先 `PodQuery` / `DeploymentGateway` / `ResourceClient`，避免数据库心智。Strategy / Factory / Builder 只在真实变化轴或构造确实复杂时使用；没有第二实现不要提前 Strategy Framework；不要 `PodFactory` 只是 new struct。优先 Struct + Default，不要为了模式而 Builder。

内部事件只用于解耦通知（ClusterConnected、LogDownloaded）。核心流程保持显式调用。禁止事件链成为主流程。Rust 用 Tokio broadcast/watch/mpsc；禁止 Global Event Bus。

V1 不做：微服务拆进程、Event Sourcing、Redux、XState、RxJS。日志流：Rust Stream + Channel + React subscription。

Plugin System：已采纳（`PLUGIN_PRODUCT.md`、`PLUGIN_RUNTIME.md`、`PLUGIN_VIEW_CONTRIBUTION.md`、ADR 0012–**0016**）。**Official-first**；Provider / Experience；V1 Bundled only。**UI = Placement（9 点）**；Custom React 一等；Declarative 可选。TypeScript First；Rust = Accelerator。不做 Marketplace / Sandbox / External ZIP。Core 无 Provider 业务概念、无官方特权后门。

---

## Native / AppState / 任务

Rust 不上重型 DI。`AppServices` + Constructor Injection。不要 Service Locator。

Tauri `AppState` 只保存稳定共享服务、Client Registry、Task Registry。不要保存所有 Pods / Logs / UI state。

`ClusterClientRegistry`：按 `ClusterId` 复用 Client；connect / disconnect / refresh credential。Credential 变更重建 Client；Disconnect 释放 Watch / Stream。禁止每个 Query 重新解析 kubeconfig。

`TaskRegistry`：taskId、type、startedAt、status、cancelHandle。GUI 可查看后台任务。所有长流程必须 Cancellation，传到 Rust Task。Session 关闭释放 Task / Channel / File / Socket / Watch / Terminal。禁止 Tab 关了后台继续跑。

禁止无限 spawn。Semaphore / Bounded Channel 控制并发 Watch / Log Stream / Download / Search。日志 backpressure：K8s Stream → Bounded Channel → File Writer → UI Buffer。UI 跟不上时优先写文件、可 drop viewport update，**不能 drop 原始日志**。

缓存必须明确 Source of Truth、TTL、Invalidation，否则不得新增。多层缓存职责不同：Rust 减昂贵 API/parsing；Query 减 UI request；UI 只保留当前展示。不要四层都永久存完整对象。

持久化分类：Preference → Store；Workspace metadata → Store / SQLite future；Large logs → File；Credential → Stronghold。禁止 `everything.json`。Settings 必须 `settingsVersion` + migration。任何持久化数据都要有升级策略。

---

## 错误、重试、安全

错误分层：Domain / Infrastructure / Application → `AppErrorDto`。UI 展示用户语言 + 技术详情。Severity：Info / Warning / Recoverable / Fatal。不要所有错误都 Toast。Log Stream 断开可 Recoverable 自动 reconnect；Credential invalid 对当前动作 Fatal。

Retry 必须显式策略。适合：网络瞬时、Watch disconnect。不自动 retry：Unauthorized、Forbidden、Invalid Manifest、Validation。禁止全局 `retry: 3`。Watch/Stream reconnect：Exponential Backoff + Jitter。

外部输入均不可信（K8s API、File、kubeconfig、User Input、未来 Agent）。必须 Validation / Parse。映射：K8s Pod → `PodDto` → `PodView`。UI 不直接依赖外部 Schema。List 用 Summary，Detail 才 Details。

Secret：React 不拥有真实 value。默认 name / keys / metadata。Reveal 必须明确操作。value 只在 Rust 短生命周期，不进 Store / Query Cache / console。

权限：即使 V1 kubeconfig 也要区分 CanView / CanExec / CanDelete / CanScale / CanEdit（SSAR 或 capability）。不要等用户点了才 Forbidden。支持 Cluster Readonly：禁掉所有 write command。危险操作（Delete、Restart Production、Scale to 0、Apply Raw YAML、Delete PVC）必须显式确认；高风险可要求输入名称。

---

## Kubernetes 运行时

Refresh：Pull + Watch + Manual。不要单纯 1s polling。推荐 Initial List → ResourceVersion → Watch → Apply Delta；断开后重新 list / reconnect。Event 是短期事实；V1 不假装永久历史。

Lazy：Raw YAML、Events、Logs、Terminal、Metrics、Secrets metadata — 打开 Tab 才加载。大量列表：Server pagination 或 Client virtualization。

写路径考虑 `resourceVersion`。重复点击 Restart 必须 disable-while-running 或 operation key 去重。

Capability Detection（Ingress API、Metrics Server、Exec、Ephemeral Container），不硬编码 `kubernetesVersion >=`。不支持则 UI `unsupported`，不 crash。

Undo（本地未 Apply）与 Kubernetes Rollback 必须分开，不能混成一个按钮。

---

## UI / Desktop 体验

Design System：Button、Input、Table、StatusBadge、EmptyState、ErrorState、LoadingState、ResourceIcon、Panel、Tabs、SplitView。业务页不得随意拼 Radix 原语形成不同视觉。

`ResourceStatus` 统一颜色/图标/文案：Running / Pending / Warning / Failed / Terminated / Unknown。

Keyboard First：Cmd/Ctrl+K / P / W / F；Log Viewer 搜索与 Esc；Terminal 标准快捷键。后续 Shortcut Registry。

Accessibility：真正的 button、Input 有 label、Dialog focus trap。禁止 `<div onClick>` 充当控件。

每个页面：Loading / Empty / Error / Normal / Partial。首次可 Skeleton；频繁刷新用 `keepPreviousData`，不要闪 Skeleton。

配置分 Desktop / Cluster / Application Runtime / Kubernetes / Secret，不要一个 Settings 巨页。未完成能力用集中 Feature Flag，禁止 `if (true)` 藏半成品而后端已生效。

通知：OS Notification 只用于长操作完成、Deployment Failed、Download Complete。不要每个 Pod Event 都系统通知。

重启恢复：Workspace、Tabs（可配置）、Cluster Connections、Layout。Terminal / Live Log **不假装恢复**，明确 Disconnected / Session ended。断网：保留已下载日志；资源页 Last Known Snapshot，标记 Offline / Stale。

---

## 观测、审计、预算

性能敏感操作预留 metrics（debug instrumentation 即可）：`log.read.duration`、`log.search.duration`、`k8s.request.duration`、`ipc.payload.bytes`。复杂操作用 `operationId` 贯穿 React → tracing span → K8s。

V1 可记本地操作历史（时间、Cluster、NS、Resource、Action、Result），非企业审计。

Performance Budget 由 benchmark 修正。初始方向：冷启动尽可能 < 2s；10 万行日志 UI 可交互；1GB 日志不进 JS Heap；实时日志跑 30 分钟 UI 不明显增长。核心场景必须查泄漏：开/关日志与 terminal、切换 cluster（Task、Channel、Listener、Event Handler）。

---

## ADR / 技术债 / DoD

必须 ADR：新增全局状态管理、数据库、第二 UI/CSS 库、Agent、GitOps、第二 async runtime、消息总线、Plugin System、改 IPC 架构、改日志存储模型。也必须 ADR：Redux、XState、RxJS、Event Sourcing。

技术债写入 `docs/technical-debt.md`（问题、原因、影响、计划阶段）。禁止无记录的 temporary fix。

DoD：Functional、Typed、Error、Loading、Cancellation、Permission、Tests、Lint、无明显泄漏、性能影响已检查。不是「页面能点」就算完成。

---

## 最终原则

State has ownership. Every state must have one clear owner.

Remote facts belong to Query. UI state belongs to UI Store. Large data belongs to Rust / Disk.

Commands express intent. Queries never mutate. Streams are bounded. Long tasks are cancellable.

External systems are adapters. Patterns solve real problems. Do not implement patterns for aesthetics.
