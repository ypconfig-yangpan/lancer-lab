# Additional Engineering Constraints

补充 Architecture / Rust / React / Tauri / Performance。级别：

- **MUST**：强制。违反等于缺陷。
- **SHOULD**：默认遵守；违反须在 PR/ADR 说明原因。
- **MAY**：按场景选择。不要为满足形式写出过度复杂代码。

Cursor 规则镜像：`.cursor/rules/lancer-priority.mdc`、`lancer-k8s-safety.mdc`、`lancer-log-engineering.mdc`、`lancer-process.mdc`。

与既有文档冲突时，按下文 **Rule Priority**。本文 MUST 优先于未分级的「建议」。

---

## 1. Rule Priority — MUST

冲突时：

Security > Data Integrity > Correctness > Performance > Maintainability > Developer Convenience

禁止为开发方便牺牲：权限、数据正确性、资源安全、Secret 安全。

## 2. MUST / SHOULD / MAY — MUST

新架构规则必须标注级别。不要把所有建议当强制。避免为形式规则写出过度复杂代码。

---

## Production / Identity / Context

### 3. Environment Risk Level — MUST

`LOCAL | DEV | TEST | STAGING | PROD`

PROD 自动启用：Dangerous Action Confirmation、Readonly Default、Diff Before Apply、明确 Cluster/Namespace 展示、禁止误操作快捷键。

### 4. Cluster Identity — MUST

不能仅靠 displayName。内部稳定 `ClusterId`。`ClusterIdentity` 至少：API Server、CA Fingerprint、Context。避免两个都叫 production 时操作错集群。

### 5. Context Awareness — MUST

危险操作 UI 始终显示 Cluster、Namespace、Resource。禁止只有 `Delete iam-123?`。

### 12. Namespace Boundary — MUST

Query/Command 默认显式 namespace。禁止意外 all-namespaces，尤其 Delete / Patch / Exec / Logs。仅明确 All Namespace 页允许 cluster-wide。

### 13. Permission Check — MUST

危险按钮显示前优先 SSAR（`canDeletePod` / `canPatchDeployment` / `canExecPod`）。避免操作后才 403。

### 14. Impersonation Ready — SHOULD

架构允许未来 Impersonation。不要假设 kubeconfig Identity 永远等于最终执行 Identity。V1 不实现 Impersonation。

---

## Kubernetes Write Path

### 6. Dry Run — SHOULD（Raw YAML Apply：MUST）

写操作优先：Validate → Dry Run → Diff → Apply。Raw YAML Apply 必须先 server-side validation。

### 7. Diff Before Write — MUST（PROD）；SHOULD（其他）

重要写操作能展示 Before/After（replicas、image、resources、env、probe）。生产默认必须展示 Diff。

### 8. Write Strategy — MUST

结构化修改优先 Patch。复杂 Desired State 用 Server-Side Apply。避免 GET → 改 → PUT 整对象覆盖别人。

### 9. Field Manager — MUST（若 SSA）

统一 `fieldManager`，例如 `devops-desktop`。禁止每模块随机 fieldManager。

### 10. Resource Version — MUST

更新考虑 `metadata.resourceVersion`。Conflict 不得静默覆盖：重新读取 → 重新 Diff → 提示用户。

### 11. Delete Propagation — MUST

删除必须明确 Foreground / Background / Orphan。不能一个默认策略覆盖所有资源。

### 40. Optimistic concurrency — 见 Architecture Rules #40；与本节 10 一致。

### 94. Hidden Magic — MUST

禁止打开页面自动修复 Deployment。任何写操作必须有明确用户意图。

### 95. Reconciliation Boundary — MUST

Desktop V1 不是 Controller。禁止偷偷无限 Reconcile Loop。那属于未来 Agent/GitOps。

---

## Secrets / Shell / TLS

### 15. Secret Redaction — MUST

日志、错误、Diagnostics、Crash Report 必须 Redact。至少：token、password、authorization、clientSecret、accessKey、secretKey、privateKey。禁止 Debug 输出完整 kubeconfig。

### 16. Clipboard — MUST

复制 Secret 必须显式动作。默认不得自动复制 Credential。自动清空 Clipboard：MAY。

### 17. UI Exposure — MUST

Secret 默认 `••••••`。Reveal 明确操作。切换页面后自动重新隐藏。

### 18. Tauri Shell — MUST

禁止任意本机 shell。K8s Terminal 走 Exec。开放本机命令必须 ADR。

### 42. TLS — MUST

生产默认验证 TLS。禁止 `accept_invalid_certs=true` 作为长期方案。开发 insecure 必须明显标识。

### 84. Secret Metadata — MUST

List Secret 默认只 metadata + keys，不默认读完整 value。

---

## Rust Safety / Files / Disk

### 19. Unsafe — MUST

业务代码禁止 `unsafe`。若需要：独立模块 + 注释 + ADR + 单独测试。默认 unsafe-free。

### 20. Panic — MUST

业务路径不得 panic。Network / File / K8s / User Input 用 `Result`。panic 仅 Programming Bug / Invariant。

### 21. Crash Recovery — MUST

Crash 不得损坏 settings / workspace / downloaded logs。重要配置：temp → fsync if needed → atomic rename。

### 22. Atomic File Write — MUST

配置禁止直接覆盖：`config.tmp` → write → validate → rename。日志流可 append。

### 23. File Locking — MUST

同一日志文件的 Reader / Writer / Export 必须有并发策略。禁止下载写 + Export 读 + Clear 删除互打。

### 24. Disk Budget — MUST（数值 SHOULD 后定）

Local Cache 有最大容量、单应用容量、自动清理。禁止无限缓存日志。默认 GB 数以后定。

### 25. Disk Low — MUST

磁盘不足：暂停大下载、暂停自动缓存、明确提示。

### 79. Path Handling — MUST

Rust 用 `Path` / `PathBuf`。禁止手拼 `"/"`。

### 80. Case Sensitivity — MUST

不能假设文件系统一定大小写敏感。

### 93. Database V1 — MUST

无明确 Query 需求禁止引入 SQLite。文件和 Store 能解决就先解决。

---

## Logs / Search / Stream

### 26. Log File Naming — MUST

文件名稳定可解析：cluster、namespace、pod、container、startTime。禁止只存 `app.log`。

### 27. Encoding — MUST

默认 UTF-8。非法 UTF-8 不能整份失败：lossy display；Raw export 保持原始 bytes。

### 28. Line Length — MUST

单行可能 KB–MB。超长行折叠 / 截断预览 / 按需展开。

### 29. Ordering — MUST

多 Pod 合并按 timestamp。缺失则标记 ordering approximate，不伪造严格顺序。

### 30. Timestamp — MUST

内部 UTC Instant。UI 再转本地。禁止字符串比较时间。

### 31. Duplicates — MUST

重连可能重复。用 cursor / timestamp / offset / connection generation 降重。不假设 exactly-once。

### 32. Loss Visibility — MUST

可能丢失时告诉用户（Pod deleted、rotation gap、interruption）。不假装完整。

### 33. Backpressure — MUST

任何 Stream 用 bounded channel。禁止 unbounded。消费者慢：优先落盘，UI 可降频。

### 36. Regex Safety — MUST

用户 Regex 必须考虑 catastrophic backtracking。不得卡死整个应用。优先安全 Regex Engine。

### 37. Search Cancellation — MUST

搜索可取消。新查询取消旧查询。

### 38. Search Result Limit — MUST

不得一次把百万条结果给 React：count + paged matches。

### 39. Export Streaming — MUST

大导出 stream-to-file。禁止整份进内存再 write。

### 40. Compression — MUST

gzip/zip Streaming Compression。

### 81. Line Ending — SHOULD

LF / CRLF 日志查看器不得异常。

### 82. Unicode — MUST

搜索不得按 byte index 随意截断 UTF-8。

---

## Runtime Budget / Network / Sessions

### 34. Memory Budget — SHOULD

为 WebView / Rust Core / Log Buffer / Monaco / Terminal 建预算。禁止模块无限扩张。

### 35. CPU Budget — SHOULD

搜索、Regex、压缩不得长期占满 CPU。CPU-heavy concurrency ≤ N。

### 41. Network Timeout — MUST

connect / request / idle timeout。禁止无限等待。Stream 例外但必须 heartbeat / cancellation。

### 43. Proxy — SHOULD

架构预留 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`。不要假设直连。

### 44. Offline — MUST

Cluster 不可达时本地日志/历史/配置仍可看。连接失败不能导致整个 App 不可用。

### 45. Last Known State — MUST

离线缓存必须标 `STALE` + `lastUpdatedAt`。禁止假装实时。

### 54–59. Lazy / Limits — MUST

启动不立刻连所有 Cluster、加载所有 NS、Monaco、Terminal、图表。只自动连接当前 Workspace 与 Pin 的集群。Watch 按需；同 cluster+ns+resource 共享 Watch。限制同时 Terminal 与 Follow 数量（具体数字 Benchmark 后定）。

### 60–64. Terminal / Monaco — MUST

Terminal 不自动 root。resize 同步 Exec PTY。断线显示 Disconnected，禁止假活输入。离开 Raw YAML 必须 dispose Monaco；关 Terminal 必须 dispose xterm/addons/listeners，并有 Leak Test。

### 65–66. Isolation — MUST

Workspace 必须有 Error Boundary。一个 Panel 崩溃不得整桌面白屏。一个 Log Task fail 不得拖垮其他 Cluster Session。

### 96–97. Background / Shutdown — MUST

最小化时哪些任务继续必须明确（Download 继续；Log Follow 可配置；Terminal 继续）。退出必须 Cancel / Flush / Persist / Close，有 Shutdown Timeout，不能卡死退出。

---

## Operations / UX

### 67–69. Operation — MUST

重要写操作产生 Operation：`operationId`、action、target、时间、status、error。状态统一：Queued / Running / Succeeded / Failed / Cancelled。只有真正可取消才显示 Cancel。

### 70. Destructive Confirmation — MUST

按风险分级确认。Delete Namespace / PVC / Scale Prod to 0 用强确认。一般 Restart 普通确认。不要所有按钮同一确认框。

### 71. Undo — MUST

本地 UI 可 Undo。已执行 K8s 动作用 Reverse / Rollback，不伪装 Undo。

### 72. Notification Noise — SHOULD

聚合通知（20 Pod restarted），不要 20 个 Toast。

### 73. Shortcuts — MUST

统一 Shortcut Registry。禁止各页自行 `window.addEventListener("keydown")`。

### 74. Palette Permission — MUST

无权限命令隐藏或 Disabled + reason。不得偷偷可执行。

### 75. Design Token — MUST

Token 是稳定 API。业务禁止依赖 Radix 内部 class。

### 76–77. Persistence — SHOULD

恢复 Panel/Tabs 须验证 Cluster/Resource 仍存在。恢复窗口前验证屏幕仍存在。

### 78. Platform — MUST

平台差异走 `PlatformAdapter`。禁止 JSX 到处 `if macOS`。

---

## Data / IPC / Future Agent

### 83. Large JSON — MUST

ManagedFields 等默认不进 UI Model。Raw 按需加载。

### 85. ConfigMap — SHOULD

大 ConfigMap 不自动展开，Lazy Load。

### 86. YAML Round Trip — MUST

parse+serialize 可能丢 comment/format/ordering。修改 Raw 必须明确此行为；要保留原文则文本级编辑。

### 87. JSON Patch — SHOULD

结构化 GUI 修改生成精确 Diff，不要重序列化整份 YAML。

### 88–89. DTO — MUST

IPC DTO 是稳定边界，不把内部 Rust struct 当长期外部 Contract。重大改动考虑版本字段。

### 90–92. Agent — SHOULD（实现：MAY / V1 不实现）

保持 `ClusterGateway`，未来 Direct / Agent。V1 不实现 Agent。未来 Capabilities handshake。新 Desktop 不能默认要求 Agent 同步升级。

---

## Build / Release / Testing

### 46. Auto Update — SHOULD（后期）

Update/Download/Install/Restart 明确流程。企业可 Disable Auto Update。

### 47. App Version — MUST

Diagnostics 显示 App / Tauri / Rust build / Commit SHA / Build Time。

### 48–51. Supply Chain — MUST（audit：SHOULD 后期 CI）

提交 `pnpm-lock.yaml`、`Cargo.lock`。CI 用 lockfile。禁止生产自动升级 dependency。禁止 `*` / 无限制 latest。引入前确认 License。后期 `cargo audit` / `pnpm audit`。

### 52–53. Bundle — SHOULD

安装包 Size Benchmark。Monaco / ECharts / Terminal Lazy Load。

### 98–100. Diagnostics / Crash / Telemetry — MUST

Diagnostics 不含 Token / Secret / Private Key。Crash Report 默认关闭敏感上传，必须先 Redact。V1 默认不采集行为 Telemetry；未来 Opt-in、透明、可关闭。

### 101–105. Testing — MUST（pyramid）；SHOULD（kind 覆盖）

Unit / Contract / Integration / E2E。不要全是 Component Test。准备 kind/k3d 与 API Fixture。Chaos：API down、Pod 消失、Watch 关、Token 过期、磁盘满、网络断、权限变、Stream 停。关键 Benchmark 退化不得直接 Release。

### 106–111. Release — SHOULD（signing：正式发布 MUST）

Channel：stable / beta / dev。SemVer；breaking config/protocol 必须 migration。每次 Release 有 CHANGELOG（Added/Changed/Fixed/Security）。正式发布 macOS/Windows 签名。生产 Source Map 策略明确。CI Secret 不得编进前端 bundle。

### 118. Experimental — MUST

实验功能显式标记，不偷偷进 Stable UX。

### 119. ADR Lifecycle — MUST

ADR 不允许删除。被替代：`Status: Superseded` + 链接新 ADR。

---

## Module Hygiene

### 112–115. Ownership — MUST

核心 Feature 有 Owner Module，禁止循环依赖。`shared/` 只放真正通用。禁止巨大 `utils.ts` / `utils.rs`；按 time/path/format/validation 组织。

### 116–117. Config — MUST

禁止 magic timeout/retry/chunk。统一常量。覆盖：Default < User Settings < Workspace Settings。

### 120. Architecture Fitness — MUST

重要 Feature 完成后自检：Remote 是否进 Zustand、大文件是否进 JS、是否新全局状态、无界 Stream、重复 Library、破坏边界、新的 Source of Truth。

---

## Final Principle

The Desktop is not the database.  
The React tree is not the log store.  
The Kubernetes API is not a permanent log archive.  
The UI is not allowed to silently mutate infrastructure.  
The local filesystem is a resource with limits.  
Every long-running operation has lifecycle.  
Every dangerous operation has context.  
Every external fact has an owner.  
Every cache has invalidation.  
Every stream has backpressure.  
Every task can eventually stop.  
Every dependency has a cost.
