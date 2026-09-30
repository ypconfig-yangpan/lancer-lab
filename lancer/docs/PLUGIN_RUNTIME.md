# Plugin Runtime

> 状态：已采纳。Kernel 决策见 [ADR 0012](./adr/0012-plugin-runtime.md)；**语言与运行时拓扑**见 [ADR 0013](./adr/0013-typescript-first-plugin.md)；**UI Placement**见 [ADR 0016](./adr/0016-plugin-ui-placement.md) / [PLUGIN_VIEW_CONTRIBUTION.md](./PLUGIN_VIEW_CONTRIBUTION.md)；**产品路线**见 [ADR 0015](./adr/0015-official-first-plugin-product.md) / [PLUGIN_PRODUCT.md](./PLUGIN_PRODUCT.md)。

Lancer Plugin Kernel combines Spring-like lifecycle ownership, VS Code-style contributions, and a Harness-style single `apply()` business entry.

---

## Core principles

> Core owns platform. Plugin owns DevOps capability.

> Core owns layout. Plugin contributes UI.

> Core owns **placement**（挂载点）与 PluginViewHost；Plugin owns **content** 与内部渲染（[ADR 0016](./adr/0016-plugin-ui-placement.md)）。Declarative helpers 可选，Custom React 一等。

> Every plugin owns a lifecycle and a resource scope.

> Built-in plugins and future external plugins must use the same Plugin API.

> Dynamic disable/unload must never leave stale UI, listeners, sessions, commands or tasks.

**Architecture rule:**

```text
Built-in is a distribution concept,
not an architecture privilege.
```

内置插件只是随 Desktop 一起分发的插件，不是 Core 功能。禁止 `if (pluginId === "official.kubernetes")` 后门。

```text
Plugin disable must be equivalent to
removing its runtime presence from the application.
```

除了 JavaScript 模块可能仍留在当前 Realm 的 module cache 外，不允许残留业务运行状态。

---

## Product classification（V1）

路线：**Official-first + Plugin-native + Ecosystem-ready**（详见 [PLUGIN_PRODUCT.md](./PLUGIN_PRODUCT.md)）。

产品层只分两种 Plugin（同一 Runtime）：

| 类型 | 含义 |
|------|------|
| Provider | 连接外部系统（k8s / docker / git / …） |
| Experience | 经 Slot 组装场景（application-workspace 等） |

V1 分发仅 **Bundled Official**；实现顺序：`mock` → `kubernetes` → `docker` → `git`/`ssh` → `jenkins` → `application-workspace` → …

UI Contribution 固定 9 种；实现三级：Declarative → Platform React → Custom View。

---

## TypeScript First Plugin Architecture

正式规范（[ADR 0013](./adr/0013-typescript-first-plugin.md)）：

> TypeScript is the default language for Lancer plugins.

> Rust is used where native access, security, throughput, memory control or heavy IO justify it.

> Plugin authors should not need Rust for normal DevOps integrations.

> Built-in plugins and external plugins use the same Plugin API.

> Avoid one-runtime-per-plugin architecture.

> Prefer one lazy shared JS Extension Host for plugin backend logic.

### 总体分层

```text
Lancer Desktop
│
├── React UI Runtime
│   └── Plugin UI (views / inspector / panels)
│
├── JS Extension Host（共享、懒启动）
│   └── Plugin Backend Logic (apply / provider / mapping)
│
└── Rust Kernel
    └── Native Platform Services (process / fs / logs / pty / credentials / …)
```

| 层 | 负责 |
|----|------|
| React / TypeScript UI | View、交互、有界展示 |
| JS Extension Host | 编排、Provider / REST / SDK、DTO mapping、`apply()` |
| Rust | Heavy IO、Native、Security、Performance 敏感能力 |

### 默认开发语言

插件默认 **TypeScript**。可包含：`manifest`、`activate`、`apply`、contributions、`deactivate`、UI components、provider client、business mapping。

**不要**为普通 Provider 强迫插件作者去写 Rust。

### 一个逻辑 Plugin，两个 JS 区域

即使都是 TypeScript，运行位置也不同：

```text
official.kubernetes
        │
        ├── UI Side          → React WebView
        └── Extension Side   → JS Extension Host
```

| Side | 允许 | 禁止 |
|------|------|------|
| UI | View / Inspector / Activity / Panel / Action 触发 | K8s auth、Docker socket、SSH、CLI 执行、读凭证、无约束 FS |
| Extension | Provider SDK、REST、CLI orchestration、mapping、`apply()`、连接管理 | 把巨量日志全文塞进 WebView |

推荐包结构（目标；V1 可渐进迁入）：

```text
plugins/<id>/
├── manifest.json
├── package.json
└── src/
    ├── extension/     # backend logic（无 React）
    └── ui/            # React contributions
```

### Rust = Native Accelerator（不是默认 Plugin Backend）

Rust 角色：**Native Platform Kernel**。

典型归属 Rust：Process execution、Filesystem、Credential Vault、Native dialog、PTY、大日志 / 大文件、Compression、高吞吐 stream、Search / Regex、Security boundary、Plugin process management、IPC、Crash handling、Updater、Diagnostics。

| 能力 | 默认实现 |
|------|----------|
| REST API / Provider SDK / JSON mapping / Plugin orchestration / UI / CLI orchestration / 普通状态查询 | TypeScript |
| 大日志 / 大文件 / Regex·Search / Compression / PTY / Credential Vault / Native OS API / Process 安全控制 / 高吞吐 Streaming | Rust |

**禁止**建立两套体系：Built-in Rust Plugin API vs Community JS Plugin API。

**下一阶段**不强迁现有内置插件为「整包 Rust Backend」。优先验证：

```text
official.mock          → Pure TS Plugin
official.kubernetes    → TS UI + TS Extension + Rust Native only where required
```

### Native Capability API（目标）

插件经 `PluginContext` 使用平台能力，**不**直接依赖 Tauri command 名称：

```ts
// 目标形状（分阶段落地）
ctx.native.process.exec({ command, args })
ctx.native.logs.open({ provider, connectionId, namespace, pod, … })
ctx.native.terminal.open({ provider, target })
```

内部链路（示例）：

```text
Plugin TS → Extension Host → Native Capability Protocol → Rust Service → OS / kubectl / …
```

日志：插件只描述「要什么日志」；Rust 负责 stream / backpressure / 落盘 / rotation / search / export；Frontend 只拿有界窗口。

### Shared Lazy JS Extension Host（目标）

```text
推荐：1 个 Extension Host 加载 N 个 JS Backend Plugins
禁止默认：Kubernetes / Docker / Jenkins 各起一个 Node 进程
```

启动策略：

```text
Desktop 启动 → Tauri + WebView + Rust Kernel
（无 JS backend 需求时不启动 Extension Host）

第一次需要 JS Backend Plugin → ensureExtensionHost() → load plugin
最后一个 JS Backend Plugin 退出 → idle → optional delayed shutdown

0 active JS backend plugin = 0 unnecessary extension host
```

**V1 现状：** 插件模块与 Shell 同 WebView 加载（`BundledFrontendPluginLoader`）；`BackendRuntime` 为同进程 stub。同进程阶段仍应在代码与包结构上区分 `ui/` 与 `extension/`，并为 `ctx.native` / Host RPC 预留边界——**不得把「永远无 Extension Host」写成终态**。

---

## Plugin 编程模型

保持简单，接近 VS Code Extension / Harness：

```ts
export interface DevOpsPlugin {
  readonly manifest: PluginManifest;

  activate(context: PluginContext): Promise<void> | void;

  apply?(request: PluginRequest, context: PluginContext): Promise<PluginResponse>;

  deactivate?(reason?: PluginDeactivateReason): Promise<void> | void;

  dispose?(): Promise<void> | void;
}
```

目标体验：`manifest` → `activate` → `apply` → contributions → `deactivate`。  
复杂度（IPC、进程、生命周期回收）由 Lancer Platform 吸收。

验证链路（优先在 mock，再 kubernetes）：

```text
activate → register UI → apply → JS provider logic
  → optional ctx.native.* → result → UI → deactivate → cleanup
```

---

## Core Boundary

```text
Lancer Core
├── Tauri
├── React Shell
├── Plugin Runtime / Kernel
├── Extension Host Runtime（目标）
├── Native Services（Rust）
└── Plugin SDK

DevOps capabilities → Plugins only
```

Core **不得**加入 `KubernetesService` / `DockerService` / `JenkinsService` 等领域服务。

---

## Directory structure（当前仓库）

```text
lancer/src/
├── plugin-kernel/           # Plugin Kernel (Host)
│   ├── catalog.ts
│   ├── lifecycle-manager.ts
│   ├── plugin-manager.ts
│   ├── context.ts
│   ├── scope.ts
│   ├── disposable.ts
│   ├── dependency-resolver.ts
│   ├── backend/             # BackendRuntime（V1 stub；未来接 Extension Host）
│   ├── loader/types.ts      # FrontendPluginLoader + BundledFrontendPluginLoader
│   ├── platform/            # Global registries (plugins see scoped facades only)
│   └── react/               # Provider / ErrorBoundary / ViewHost
├── plugins/
│   ├── official.mock/       # Acceptance plugin（纯 TS）
│   └── official.kubernetes/ # 第一能力插件（目标：TS UI + TS Extension + Native）
├── ui/                      # @devops-desktop/ui design system surface
└── app/plugin-bootstrap.ts
```

Kernel 不得直接依赖 Kubernetes / Docker / Jenkins / Git 等领域实现。

---

## Lifecycle state diagram

```text
DISCOVERED
    ↓
INSTALLED
    ↓
RESOLVED  → (manifest activities discovered)
    ↓
INACTIVE
    ↓ (ensureActive / lazy activation)
LOADING
    ↓
INITIALIZED   (plugin.initialize)
    ↓
ACTIVATING    (plugin.activate → contributions)
    ↓
ACTIVE
    ↓ (disable / unload)
DEACTIVATING
    ↓
INACTIVE
    ↓ (unload)
UNLOADING
    ↓
UNLOADED

Any step may enter FAILED → cleanup → INACTIVE (reloadable)
```

状态只能由 `PluginLifecycleManager` 修改。

**并发协议：** 每插件 lifecycle 操作（activate / deactivate / enable / disable / unload）走串行队列。Disable / Unload 可立即 `setEnabled(false)`、block requests、abort in-flight `PluginScope`；不得仅靠增加非法状态跳转解决竞态。

依赖版本：`PluginDependencyResolver` 使用 SemVer（`semver` 包）校验 manifest version 与 dependency range。

---

## PluginContext API

每个插件独立 `PluginContext`（类似轻量 ApplicationContext）：

```ts
interface PluginContext {
  pluginId: string;
  lifecycle: PluginLifecycleContext;
  commands / views / slots / activities / inspector / statusBar; // scoped
  sessions / operations / credentials / events / storage / queries;
  disposables: DisposableStore;
  abortSignal: AbortSignal;
  /** V1：已提供；diagnostics.health 已桥接；其余多为 NATIVE_UNAVAILABLE / FORBIDDEN stub */
  native: NativeApi;
}
```

插件拿不到全局 Registry。Scoped API 在 `register()` 时自动 `disposables.add()`。  
插件世界只有 `PluginContext`，看不到 `LancerApp`。  
Shell / UI 经 `ShellFacade.apply(pluginId, request)` 进入插件业务（不要在 feature 里散落 Tauri command 名）。

---

## Disposable / PluginScope

```text
activate
  → new PluginScope (AbortController + DisposableStore)
  → PluginContext
  → register* → Disposable → store

deactivate
  → block requests
  → cancel operations / close sessions
  → unregister contributions
  → cancel/remove plugin query keys ["plugin", pluginId, ...]
  → plugin.deactivate()
  → PluginScope.dispose()  // abort + dispose all
  → plugin.dispose()
```

Host 拥有最终清理权；不得只靠插件作者自己清。

---

## FrontendPluginLoader

```ts
interface FrontendPluginLoader {
  load(descriptor): Promise<LoadedFrontendPlugin>;
  unload(pluginId): Promise<void>; // Logical Unload in V1
}
```

V1 实现：`BundledFrontendPluginLoader`（静态 import map）。

**物理卸载限制（必须写明）：**

ES Module 动态 import 进主 WebView 后，**不能保证**从 JavaScript Realm 物理卸载。  
V1 `unload()` = Logical Unload（释放 React 引用、registries、tabs、listeners、timers、sessions、AbortControllers、plugin stores）。  
未来 External Plugin UI 使用 Sandboxed WebView / iframe / Worker，销毁 Runtime 才是物理卸载。

扩展点预留：`ExternalModuleFrontendPluginLoader` / `SandboxedFrontendPluginLoader`。

---

## Registry ownership

| Registry | Owner | Scoped? | On deactivate | On disable |
|----------|-------|---------|---------------|------------|
| CommandRegistry | Core | yes | unregisterByPlugin | same |
| ViewRegistry | Core | yes | unregisterByPlugin | same |
| ActivityRegistry | Core | yes | keep (reload) | clear + restore on enable |
| Inspector / Slot / StatusBar | Core | yes | unregisterByPlugin | same |
| SessionManager | Core | yes | closeAll(pluginId) | same |
| OperationManager | Core | yes | cancelAll(pluginId) | same |

**Disable vs deactivate：** `deactivate`（含 reload）保留 manifest Activity，便于再次 lazy activation；`disable` 必须移除 Activity（runtime presence 全部消失），`enable` 再注册回 manifest contributions。

Workspace tabs **不得**保存 `React.ComponentType`，只保存：

```ts
{ id, viewId, pluginId, title, params? }
```

渲染：`viewId → ViewRegistry.resolve() → factory()`。

---

## Lazy activation

Manifest `activationEvents` 示例：`onActivity:kubernetes`、`onCommand:kubernetes.*`。

流程：用户点 Activity → `PluginManager.ensureActive(pluginId)` → load → initialize → activate → 注册 runtime contributions → 打开 workspace tab。

`ensureActive` 幂等：同插件串行队列上，已 `ACTIVE` 直接返回；并发调用排队执行。

---

## V1 scope vs future

**已实现：** Manifest、Manager、Lifecycle、Context、Scope、Disposable、Registries、BundledLoader、BuiltinBackendRuntime（stub）、`ctx.native`（`diagnostics.health` + **`kubernetes.*` 读/watch**；process/logs/… stub）、`ShellFacade.apply`、ErrorBoundary、Lazy activation、Enable/Disable、Logical unload、SemVer 依赖、每插件 lifecycle 串行队列、Query/Session cleanup、Mock + Kubernetes plugins、reload×20 / registry ownership 测试。

**目标（ADR 0013 / 0014，分阶段）：** declarative helpers 扩展、更多 `ctx.native.*`（logs/terminal）、K8s 手写表可迁 Presenter、共享 Lazy JS Extension Host。

**暂不实现：** External ZIP、Marketplace、签名、跨语言 SDK、Sandbox WebView、Hot update、Remote marketplace；未到顺序的官方插件（见 PLUGIN_PRODUCT P2+）。

---

## Acceptance

1. `official.mock`：Enable → UI/commands/session/timer 出现；Disable → Activity 与全部贡献消失；再 Enable → Activity 恢复且无重复注册；`ShellFacade.apply`（`mock.echo` / `mock.ping` / `mock.health` via `ctx.native`）可用。
2. `official.kubernetes`：enable/disable/enable；无 stale Activity/views/status/commands；plugin-prefixed Query 被清；kubernetes-workspace-store reset；Watch listener 随 scope 释放。
3. 插件业务不直接写 Tauri command 名；经 `apply` / `ctx.native`（kubernetes 读路径已走 native；logs 等仍待接线）。
