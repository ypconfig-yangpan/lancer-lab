# Lancer 架构审查讨论稿（2026-09-02）

> 状态：待讨论，不代表已批准实施。
>
> 本文只记录审查发现、候选方案与验收口径，不修改现有架构决策，也不授权直接重构。

## 1. 审查结论摘要

Lancer 当前的基础工程质量总体可用：TypeScript 类型检查、ESLint、Biome 和 27 个前端测试均可通过；Rust 的 7 个单元测试也可通过。插件内核已经具备 Catalog、Lifecycle、Scoped Registry、Disposable、Session/Operation 清理和 Query Cache 清理等基础能力。

当前主要偏差不是“代码不能运行”，而是 **Kubernetes 插件化只完成了一部分**：`official.kubernetes` 注册了资源视图和 Inspector，但 Core Shell、全局启动入口和共享 Store 仍直接持有 Kubernetes 状态与行为。因此，禁用 Kubernetes 插件后，部分 Kubernetes UI、Query 和 Watch 监听仍然存在，与既有文档中的插件隔离目标不一致。

建议优先讨论并确认插件边界，然后再继续扩展 Kubernetes 功能。否则未来加入 Docker、Git、Jenkins 等插件时，Core 会持续积累具体 DevOps 领域逻辑。

## 2. 本次审查范围

主要核对了以下内容：

- `docs/ARCHITECTURE_RULES.md`
- `docs/PLUGIN_RUNTIME.md`
- `docs/adr/0012-plugin-runtime.md`
- React 启动入口与 Shell
- `official.kubernetes` 插件贡献
- PluginManager 生命周期与依赖解析
- Rust Kubernetes Client Registry 与 Watch Manager
- 前端、Rust 测试及静态检查

本次没有修改业务代码，没有纠正既有架构文档。

## 3. 发现一：Kubernetes 能力仍由 Core 持有

### 3.1 现状证据

以下 Core 或共享模块直接依赖 Kubernetes 能力：

- `src/main.tsx`
  - 无条件调用 `useK8sWatchInvalidation()`。
  - 即使 `official.kubernetes` 被禁用，全局 Tauri Event listener 仍然存在。
- `src/features/shell/status-bar.tsx`
  - Core StatusBar 直接调用 `usePods()` 判断连接状态。
  - 直接读取 Cluster、Namespace、Environment Risk 等 Kubernetes 语义。
- `src/features/shell/bottom-panel.tsx`
  - Core 直接渲染 Pod Log 和 Kubernetes Event 面板。
- `src/shared/stores/workspace-store.ts`
  - 通用 Workspace Store 直接保存 `ClusterIdentity`、namespace 和 Pod/Deployment/Service resource kind。
- `src/shared/tauri/index.ts`
  - 所有 Kubernetes IPC API 集中在共享层，而不是插件边界内。

与之相比，`src/plugins/official.kubernetes/index.tsx` 当前主要注册 Explorer、Resource Workspace View、Inspector 和一个 Refresh Command，未拥有上述全局运行时能力。

### 3.2 与既有约束的冲突

现有文档写明：

- Core owns platform/layout，Plugin owns DevOps capability。
- Kubernetes 等能力必须作为 Plugin，Core 不特判内置插件。
- Plugin disable 应等价于移除其 runtime presence。

当前实现中，禁用 Kubernetes 插件只会移除插件注册的 View、Command、Inspector 等 contribution，不会移除 Core 中的 Kubernetes Watch listener、Pod Query、Events/Logs 页面和 Kubernetes workspace state。

### 3.3 候选方案

建议采用“Core 只保留通用插槽，Kubernetes 插件贡献具体能力”的边界：

1. `main.tsx` 不再安装 Kubernetes 专用 Hook。
2. 为插件提供 Host 生命周期或后台 contribution，使 Kubernetes 插件在 activate 时安装 Watch listener，并通过 Disposable 在 deactivate 时释放。
3. StatusBar 仅渲染 `StatusBarRegistry` contribution；连接状态、Cluster、Namespace、风险等级由 Kubernetes 插件贡献。
4. BottomPanel 仅提供通用 Tab Host；Logs、Events 由 Kubernetes 插件注册 bottom-panel views。
5. Kubernetes Query Keys、IPC Adapter、Store 和实体类型迁入 `plugins/official.kubernetes` 或清晰的插件私有 feature slice。
6. Core Workspace Store 只保存通用 UI 状态，例如 activity、tabs、layout、theme、command palette；领域选择状态归插件自有 Store。

### 3.4 需要讨论的边界问题

- `Cluster` 是否属于 Lancer Core 产品领域，还是 Kubernetes 插件领域？
  - 如果未来所有 DevOps 能力都围绕统一 Environment/Connection 工作，可在 Core 定义通用 `ConnectionRef` 或 `EnvironmentRef`。
  - Core 不应直接使用 `Pod`、`Namespace`、`Deployment` 等 Kubernetes 类型。
- Logs 是否为 Core 通用能力？
  - Core 可以拥有通用 `LogSession`、日志 Viewer 和存储能力。
  - “从 Kubernetes Pod 拉日志”应属于 Kubernetes 插件 Adapter。
- Events 是否为通用事件模型？
  - Core 可提供通用 Activity/Timeline UI。
  - Kubernetes Event 查询与 DTO 应属于 Kubernetes 插件。

## 4. 发现二：禁用插件后 Activity 入口仍保留

### 4.1 现状证据

`PluginManager.deactivate()` 会清理 View、Command、Slot、Inspector、StatusBar、Session、Operation 和 Query，但刻意保留 manifest activity，直到 unload 才删除。

同时：

- `ensureActive()` 遇到 disabled 插件会抛出 `Plugin disabled`。
- `AppSidebar` 会继续显示所有 ActivityRegistry 项。
- Activity 点击处理没有捕获 activation 失败。

结果是：用户禁用插件后，Activity 仍显示；点击该 Activity 会触发 rejected Promise，且 UI 没有可理解的错误状态。

### 4.2 文档内部也存在口径冲突

`PLUGIN_RUNTIME.md` 一方面要求：

> Plugin disable must be equivalent to removing its runtime presence from the application.

另一方面 Registry ownership 表写明 manifest activity 在 deactivate 后保留到 unload。

需要先统一产品语义：

- **方案 A：禁用即隐藏。** Disable 时移除 Activity，Enable 时重新注册 manifest contribution。最符合“runtime presence 全部消失”。
- **方案 B：禁用但保留灰色入口。** Activity Registry 必须携带 enabled/disabled 状态，UI 不触发 activation，而是展示“插件已禁用”和启用入口。

建议选择方案 A；设置页已经提供插件重新启用入口，无需在主 Activity Bar 保留失效入口。

### 4.3 建议验收

- Disable 后，该插件的 Activity、View、Inspector、StatusBar、Slot、Command、Tab、Session、Operation、Query 和 Event listener 全部消失。
- Enable 后静态 manifest contribution 恢复。
- 连续 Enable/Disable 20 次无重复 contribution、无 listener/timer/session 泄漏。
- 禁用后的 UI 不产生未处理 Promise rejection。

## 5. 发现三：插件依赖版本判断不符合 SemVer

### 5.1 现状证据

`PluginDependencyResolver.satisfies()` 对 caret range 只比较 major version。

这会产生错误判断：

- `0.9.0` 会被错误认为满足 `^0.1.0`。
- `1.0.0` 会被错误认为满足 `^1.2.0`。
- 没有正确处理 prerelease、缺失段和非法版本字符串。

### 5.2 建议

- 优先使用成熟 SemVer 实现，不自行维护兼容规则。
- Catalog bootstrap 时验证 manifest version、dependency range 和 apiVersion。
- Loader 返回模块后，校验 loaded plugin manifest 与 catalog descriptor 的 id/version/apiVersion 一致。

### 5.3 建议测试

- `^1.2.0` 接受 `1.2.0`、`1.9.0`，拒绝 `1.1.9`、`2.0.0`。
- `^0.1.0` 接受 `0.1.x`，拒绝 `0.2.0`、`0.9.0`。
- `^0.0.3` 只接受兼容 patch 范围。
- 非法 version/range 在 bootstrap 阶段明确失败。

## 6. 发现四：插件生命周期缺少并发关闭协议

### 6.1 现状

`ensureActive()` 对并发 activation 做了 promise 合并，这是正确的。但 `deactivate()` 只特别处理了 `deactivating`，没有定义以下并发行为：

- LOADING 期间 Disable/Unload。
- INITIALIZED 或 ACTIVATING 期间 Disable/Unload。
- DEACTIVATING 期间重新 Enable/Activate。
- Unload 与 in-flight apply/request 的协调。

生命周期状态机也不允许 `loading -> deactivating` 或 `activating -> deactivating`，因此调用时可能出现 illegal transition。

### 6.2 候选方案

- 每个插件使用串行 lifecycle queue/mutex，所有 activate/deactivate/unload 操作按顺序执行。
- Disable/Unload 先设置 `desiredState` 并立即 block new requests，然后 abort activation scope。
- Activation hook 必须观察 `abortSignal`；超时后 Host 执行最终清理。
- `apply()` 请求要么注册为 Operation，要么至少纳入 in-flight request 计数和 cancellation。

不要仅通过增加更多允许状态跳转来解决，否则容易产生 activate 完成后又注册回 contribution 的竞态。

## 7. 发现五：Desktop CSP 为空

`src-tauri/tauri.conf.json` 当前配置 `"csp": null`。

Lancer 会读取 kubeconfig、连接 Kubernetes API 并暴露 Tauri commands。若前端出现 XSS，关闭 CSP 会显著放大风险。建议：

- 开发环境与生产环境分别配置。
- 生产构建使用最小 CSP。
- 为 Monaco、字体、样式等确实需要的来源逐项放行。
- 保持 Tauri capabilities 最小化。
- 增加一次生产包安全配置检查，而不只验证 Vite Dev Server。

在启用外部插件、WebView Sandbox 或远程内容之前，此项应完成。

## 8. 工程门禁与环境问题

### 8.1 Node/pnpm 版本未闭环

项目固定 `pnpm@11.25.0`，该版本要求 Node.js 至少为 22.13。当前机器的 Node.js 20.17 无法运行 README 中的标准命令，报错涉及缺失 `node:sqlite`。

当前 README 没有声明 Node 版本，`package.json` 也没有 `engines.node`。

建议：

- 明确项目 Node 版本并提交 `.nvmrc`、`.node-version` 或团队认可的版本文件。
- 在 `package.json` 增加 `engines.node`。
- README 开发步骤写清前置版本。
- CI 使用同一版本并直接执行标准门禁。

### 8.2 当前检查结果

绕过当前 pnpm 启动兼容问题、直接运行已安装的工具后：

- TypeScript：通过。
- ESLint：通过。
- Biome：通过，但配置 schema 版本与本地 CLI 不一致，并有 deprecated 配置提示。
- Vitest：8 个文件、27 个测试通过。
- Rust tests：7 个测试通过。
- Strict Clippy：失败。

Clippy 失败位置：

```text
src-tauri/src/infrastructure/kubernetes/registry.rs:444
unnecessary closure used to substitute value for Option::None
```

建议把 `.or_else(|| event_time)` 改为 `.or(event_time)`，并将 strict Clippy 纳入统一门禁。

## 9. 建议的处理顺序

### P0：先确认架构语义

1. 确认禁用插件时 Activity 是隐藏还是保留为 disabled UI。
2. 确认 Cluster/Environment、LogSession、Timeline/Event 的 Core 与插件边界。
3. 更新 `PLUGIN_RUNTIME.md` 中互相冲突的 disable/activity 口径。

### P1：完成 Kubernetes 插件收口

1. 把 K8s Watch listener 从 `main.tsx` 移到插件生命周期。
2. 把 K8s StatusBar、Events、Pod Logs 入口改为 plugin contribution。
3. 把 Kubernetes Store、Query Keys、IPC Adapter 和 entity types 收到插件 slice。
4. 增加真实 `official.kubernetes` disable/enable 集成测试。

### P1：修复插件生命周期正确性

1. 引入 lifecycle 串行化与 desired-state/cancellation 机制。
2. 正确处理 dependency disable/unload；不能让 required dependency 已停而 dependent 继续 active。
3. 使用可靠 SemVer 校验。

### P1：补 Desktop 安全基线

1. 配置生产 CSP。
2. 复核 capabilities 和 IPC 暴露范围。

### P2：修复工程门禁

1. 对齐 Node/pnpm 版本。
2. 修复 Clippy。
3. 迁移 Biome 配置 schema。

## 10. 建议的完成标准

本轮架构纠偏完成后，至少满足：

- Core 代码不直接 import Pod、Deployment、Namespace、Kubernetes Event 或 K8s Watch 类型。
- 禁用 `official.kubernetes` 后，不再存在其 Activity、视图、状态栏、底部面板、Query、Tauri Event listener、Session 和 Operation。
- 重新启用后贡献恢复且无重复注册。
- dependency 被禁用或卸载时，dependent 不会保持 active。
- activation 与 disable/unload 并发时，不出现 illegal lifecycle transition 或 stale contribution。
- 插件版本范围按 SemVer 正确校验。
- 生产 Tauri 配置具有明确 CSP。
- 新环境按 README 能完成 install、typecheck、lint、test、Rust test 和 strict Clippy。

## 11. 希望 Cursor 重点复核的问题

请 Cursor 不要直接开始大规模重构，先复核并回复以下问题：

1. 上述 Core → Kubernetes 的依赖清单是否完整？是否还有隐藏的反向依赖？
2. Kubernetes Watch listener 放入插件生命周期时，最小的 Host API 应是什么？能否直接用 `context.disposables` 管理？
3. Cluster/Environment、LogSession、Event Timeline 哪些应保留为通用 Core model，哪些必须归 Kubernetes 插件？
4. Disable Activity 应选择“隐藏”还是“保留 disabled UI”？选择依据是什么？
5. 生命周期串行化的最小实现是什么？如何覆盖 activate/deactivate/unload 竞态？
6. 现有测试中哪些是“测试了当前实现”，但没有验证文档承诺？
7. CSP 最小策略如何兼容 Vite、Tauri、Monaco 和现有样式方案？
8. 能否按 P0/P1/P2 给出小步提交方案，确保每一步都可回滚、可验证？

