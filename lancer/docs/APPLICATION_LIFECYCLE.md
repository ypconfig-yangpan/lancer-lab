# Application Lifecycle & Composition Root

> 状态：已采纳（2026-09-02）。实现见 `src/app/`。与 [PLUGIN_RUNTIME.md](./PLUGIN_RUNTIME.md)、[ARCHITECTURE.md](./ARCHITECTURE.md) 配套。

Lancer 是长期运行的 DevOps Desktop。Plugin Runtime、Log Workspace、Terminal、Operations、Credentials、Query、Settings、Diagnostics、未来 Agent Gateway 都会加入。启动 / 运行 / 关闭不能散落在 `main.tsx`、React `useEffect`、import 副作用和各模块私有 init 里。

必须有明确的：

> **Application Composition Root + Lifecycle Tree**

---

## 1. LancerApp 是什么

LancerApp 的职责**不是**保存所有服务，而是：

> **管理应用由哪些子系统组成，以及这些子系统按什么顺序启动和停止。**

一句话：

> **把「什么都有」换成「什么顺序」。**

---

## 2. 核心原则

### 2.1 指挥家，不是 Service Locator

正确：

```text
LancerApp
   ├── Lifecycle
   ├── Subsystem Graph（V1：注册序；演进：dependsOn 拓扑）
   ├── Shutdown Coordination
   └── Narrow Facades（ShellFacade …）
```

禁止演化成属性袋：

```text
lancer.logger / lancer.query / lancer.kubernetes / lancer.currentCluster / …
```

### 2.2 只管理生命周期，不管理业务状态

可以管：启动序、停止序、子系统依赖、Shutdown、BeforeShutdown、Lifecycle State。

不得保存：`currentCluster`、`currentNamespace`、`selectedPod`、log data、terminal state 等。这些属于 Domain / Store / Plugin。

### 2.3 Plugin 永远看不到 LancerApp

插件唯一入口：`PluginContext`。

禁止 `Plugin → LancerApp` / `Plugin → Global AppServices`。

### 2.4 React 不负责创建应用

正确：`Desktop Application → start → mount React`。  
错误：`React useState → createDesktopPluginRuntime()`。

### 2.5 Frontend / Backend 是两棵生命周期树

通过 Typed Tauri IPC 协作，不假装成一个进程内 Context。

---

## 3. 总体结构

```text
                    Lancer Desktop
                          │
                  Composition Root
                          │
                       LancerApp
                          │
            ┌─────────────┴─────────────┐
            │                           │
      Frontend Lifecycle          Backend Lifecycle
            │                           │
       React / UI                  Rust / Tauri
            │                           │
            ▼                           ▼
      ShellFacade                 app_prepare_shutdown
            │                     (+ Exit 安全网)
            ▼
      PluginRuntime → PluginContext → Plugins
```

---

## 4. Lifecycle Contract

统一：

```ts
interface AppSubsystem {
  readonly id: string;
  start?(): Promise<void>;
  stop(reason?: ShutdownReason): Promise<void>;
}
```

不要每个模块发明 `init` / `bootstrap` / `setup` / `destroy` 等另一套词汇。

### 禁止 `start(app: LancerApp)`

会把 App 重新变成 Service Locator。  
V1 用**构造注入**在 Composition Root 显式接线（等价于 Narrow Context，且更难把整个 App 传下去）。

未来若引入 `SubsystemDescriptor.context`，也必须是**子系统专用窄类型**，不是 `LancerApp`。

---

## 5. V1 子系统序（线性）

Composition Root：`src/app/create-desktop-app.ts`。

```text
diagnostics → i18n → query → plugin-kernel → workspace-chrome
```

关断严格逆序。`plugin-kernel.stop` 只调内核 teardown，App 不直接碰插件。

子系统增多（LogWorkspace、OperationPipeline…）后再引入 `dependsOn` + 拓扑排序；**不要**先实现 BeanFactory / 反射 DI / 注解扫描。

---

## 6. Shutdown

### ShutdownReason（规范名）

```ts
type ShutdownReason =
  | "user-close"
  | "restart"
  | "update"
  | "system"
  | "fatal"
  | "error";   // start 失败回滚
```

### BeforeShutdown ≠ Shutdown

BeforeShutdown **只**回答 allow / deny，**不得**偷偷 cleanup（否则用户取消退出时状态已毁）。

```ts
type ShutdownDecision =
  | { allow: true }
  | { allow: false; reason: string };
```

真正清理在各子系统 `stop()`。

### 推荐关断序（Frontend）

```text
User close → BeforeShutdown → Persist chrome → Stop subsystems (reverse)
  → Backend prepareShutdown → Flush diagnostics → Exit
```

Backend（现实现）：

```text
prepare_shutdown → stop_all watches → disconnect_all clusters
RunEvent::Exit → 同上（幂等安全网）
```

---

## 7. ShellFacade

React / Shell **不得**持有整个 `LancerApp`，也尽量不直接依赖完整 `PluginRuntime` 表面。

Shell 通过 `ShellFacade` 访问视图层需要的能力：

- Platform registries（activities / views / commands / …）
- `ensureActive` / enable / disable（Settings、Activity 点击）
- Catalog 列表与 lifecycle 观察（Settings）
- Host lifecycle events（清 tab）

插件世界仍只有 `PluginContext`。

---

## 8. 代码位置

```text
src/app/
├── create-desktop-app.ts      # Composition Root（唯一可知道全部具体实现）
├── lancer-app.ts              # 薄指挥家
├── facades/shell-facade.ts    # Shell 窄门面
└── subsystems/                # diagnostics / i18n / query / kernel / chrome
```

Rust（V1）：

```text
commands/health.rs::app_prepare_shutdown
app/mod.rs::RunEvent::Exit 安全网
```

完整 Backend Lifecycle 树（Credential / Session / Operation Subsystem）随 Phase 推进，不提前 Spring 化。

---

## 9. Review 铁律

1. **App object must never be visible to plugins.** 插件世界只有 `PluginContext`。
2. **LancerApp owns order, not domain state.** 出现 `lancer.currentCluster` 直接拒绝。
3. **Every long-lived subsystem must participate in lifecycle.** 有 task / stream / watch / session / timer / connection 必须回答：谁 start、谁 stop、谁 owns。

警报信号：`import { lancer }`、`app.services.xxx`、`globalThis.lancer`、`start(app: LancerApp)`、`React useEffect` 创建核心 Runtime。

---

## 10. 与现状对照

| 项 | V1 |
|----|----|
| Composition Root | ✅ `createDesktopApp` |
| React 后于 start | ✅ `main.tsx` boot |
| 插件不见 App | ✅ |
| BeforeShutdown | ✅ allow/deny |
| ShellFacade | ✅ |
| Lifecycle timeout | ✅ `APP_LIFECYCLE_TIMEOUTS` + duration 日志 |
| Subsystem 拓扑图 | ⏳ 线性序；能力增多后再上 |
| Backend Subsystem 树 | ⏳ prepare_shutdown + Exit；完整树后续 |

---

## Final Principle

> Who owns me? Who starts me? Who stops me? What happens when my owner disappears?

长期运行资源必须始终答得出这四个问题。
