# Plugin Product Model（V1）

> 状态：已采纳（2026-09-03）。决策见 [ADR 0015](./adr/0015-official-first-plugin-product.md)。  
> UI Placement：[ADR 0016](./adr/0016-plugin-ui-placement.md) / [PLUGIN_VIEW_CONTRIBUTION.md](./PLUGIN_VIEW_CONTRIBUTION.md)。  
> 配套运行时：[PLUGIN_RUNTIME.md](./PLUGIN_RUNTIME.md)、[ADR 0013](./adr/0013-typescript-first-plugin.md)。

## 1. 路线

```text
Official-first + Plugin-native + Ecosystem-ready
```

> 官方主流能力开箱即用；所有 DevOps 能力底层从第一天就是插件；未来再开放第三方生态。

**不是**做一个「空插件平台，请自己写插件」。  
用户打开 Lancer 应能直接使用官方能力（按实现顺序逐步上齐）：

```text
Kubernetes · Docker · Git · SSH · Jenkins · ArgoCD · Harbor · …
```

架构上全部是 Plugin，例如：

```text
official.kubernetes
official.docker
official.git
official.ssh
official.jenkins
official.argocd
official.harbor
```

**禁止：**

```text
Core Kubernetes Feature / Core Docker Feature / Core Jenkins Feature
```

Core **永远不知道**具体 DevOps 产品名；禁止 `if (pluginId === "official.kubernetes")` 后门。

---

## 2. 两种 Plugin（产品分类）

V1 **只**定义两种产品概念（不为它们做两套 Runtime）：

| 类型 | 作用 | 例子 |
|------|------|------|
| **Provider Plugin** | 连接真实外部系统 | kubernetes, docker, git, ssh, jenkins, argocd, harbor, prometheus |
| **Experience Plugin** | 把多个 Provider 组织成工作场景 | application-workspace, release-workspace, incident-workspace |

底层仍共用：

```text
Plugin · Manifest · Context · Scope · activate / deactivate / dispose
Contribution · Native API ·（可选）apply
```

### Provider

职责：连接与认证、API/SDK/CLI、数据转换、Action、Connection、UI Contribution、Command。

示例结构（Kubernetes）：

```text
Connections · Resource Explorer · Resources · Logs · Terminal · Actions
+ Application Runtime Slot（供 Experience 消费）
```

### Experience

不一定连接外部系统。最重要：`official.application-workspace`。

```text
Application: IAM
  Source   ← Slot ← Git Plugin
  Build    ← Slot ← Jenkins Plugin
  Release  ← Slot ← ArgoCD Plugin
  Runtime  ← Slot ← Kubernetes Plugin
  Metrics  ← Slot ← Prometheus Plugin
```

**禁止** Experience 直接：

```ts
import { kubernetesPlugin } from "…"
```

只消费平台 **Contribution / Slot**（如 `application.source` / `application.build` / …）。  
Workspace 只知道 Capability Slot，不知道 Jenkins vs GitHub Actions。

---

## 3. 实现顺序（用真实插件验证 API）

| 优先级 | 插件 | 角色 |
|--------|------|------|
| P0 | `official.mock` | **非产品**；验证 Platform（见 §6） | **已实现**（declarative mock） |
| P1 | `official.kubernetes` | 第一 Provider | **已实现**（Custom UI + apply 读路径；hooks 已走 apply-client） |
| P2 | `official.docker` | | **已实现**（独立 Provider + mock catalog；`ctx.native.docker` stub） |
| P3 | `official.git` / `official.ssh` | | **已实现**（独立 Provider + mock；native stub） |
| P4 | `official.jenkins` | | **已实现**（独立 Provider + mock；native stub） |
| P5 | `official.application-workspace` | 第一 Experience | **已实现**（catalog apply + Slot 组合；不 import Provider） |
| P6 | `official.argocd` / `official.harbor` | | **已实现**（独立 Provider + mock；native stub） |

若真实插件写起来不顺：**优先简化 Plugin API**，禁止官方插件绕过 API。

---

## 4. 分发：仅 Bundled

V1 只有一种分发：

```text
Lancer 安装包 → Bundled Official Plugins
  → BundledPluginCatalog → Loader → PluginRuntime → activate()
```

禁止硬编码：

```tsx
<App><Kubernetes /></App>
```

**不做（直至单独 ADR）：** Marketplace、ZIP/npm 安装、远程仓库、签名、第三方执行、Sandbox、插件自动更新、Plugin Store。

原则不变：

> Built-in is a distribution concept, not an architecture privilege.

---

## 5. 技术默认（摘要）

详见 ADR 0013 / PLUGIN_RUNTIME：

- 默认 **TypeScript + React**（`extension/` + `ui/`）。
- Rust = Native Accelerator（`ctx.native.*`），不是每插件必选 Backend。
- V1 可同进程 Bundled；API **不得假设** Plugin 与 Shell 永远同一 JS Realm（为未来 Extension Host 留边界）。
- 生命周期保持简单：`activate` / `deactivate?` / `dispose?`（可选 `apply` / `initialize` 仍允许，勿膨胀为数十个 hook）。

---

## 6. `official.mock` 验收门槛

专门验证 Platform，不是产品入口。必须覆盖：

```text
Activity · Explorer · Workspace · Inspector · Action · Command
Status · Slot · Session · Timer/Event · Query · Disposable
activate / deactivate / enable / disable
```

```text
enable → 全部出现
disable → 全部消失
enable again → 不重复
×20 → 无明显泄漏
```

通过后再加大力度推进 Kubernetes 迁完整 Provider 形态。

**当前（2026-09-03）：** Declarative tree/table/inspector、Custom workspace、Bottom、Status、Slot、Command、Session、Timer（disposables）、Event、apply、enable/disable×20 已有测试；统一 Action 多表面仍缺。

---

## 7. UI Contribution：固定 9 种 Placement

> 这 9 个是 **挂载位置**，不是 UI 组件类型（[ADR 0016](./adr/0016-plugin-ui-placement.md)）。

| # | Contribution | 含义 |
|---|--------------|------|
| 1–9 | Activity … Slot | Plugin 出现在 Shell 的哪里 |

Workspace / Explorer / Inspector **内部**可为任意 React（Table / Graph / Monaco / …）。  
Core 不规定必须是表或树。Declarative helpers 可选。

详见 [PLUGIN_VIEW_CONTRIBUTION.md](./PLUGIN_VIEW_CONTRIBUTION.md)。

---

## 8. UI 实现三级（均为正式）

| Level | 名称 | 说明 |
|-------|------|------|
| 1 | Declarative | 可选加速（简单表/Inspector） |
| 2 | Platform React | 优先 Design System |
| 3 | Full Custom View | **一等能力**（Topology / DAG / …） |

**禁止** Low-code Schema 作为唯一 UI 路径。

---

## 9. Slot（组合核心）

Experience 定义槽位，Provider 填入：

```text
application.source          ← Git
application.build           ← Jenkins
application.release         ← ArgoCD
application.runtime         ← Kubernetes
application.observability   ← Prometheus
```

没有 Slot，Experience 无法在不耦合 Provider 的前提下组装 DIY DevOps。

---

## 10. Core 允许 vs 禁止

**Core 只允许：**

```text
Shell · Lifecycle · Plugin Runtime · Contribution
Command · View · Slot · Session · Operation
Settings · Credentials · Native Services · Diagnostics
```

**Core 禁止 Provider 业务概念：**

```text
Kubernetes · Docker · Jenkins · ArgoCD · Harbor · GitLab · …
```

这些必须位于对应 Plugin。

---

## 11. V1 明确不做

```text
Marketplace / External install / ZIP / Signing / Store
Sandbox / Remote repo / Multi-language SDK / dylib
one-process-per-plugin / 复杂语义化 DevOps 标准协议
```

---

## 12. V1 必须验证

```text
load → activate → UI Contribution → Provider operation
Session · Native API
disable → Contribution/Session/Query/Timer/Event 清理
re-enable → 无重复、无特权
```

官方插件 **无任何 Core 特权**。

---

## 13. 产品叙事

用户第一阶段看到的是：

```text
Choose your DevOps stack
  Source / Build / Runtime / Delivery / Registry
```

由官方 Plugin 提供——**不是**「欢迎使用插件平台，请自己开发」。  
未来再出现：「找不到工具？Build your own integration。」

---

## 14. 与当前代码的差距（简表）

| 决策项 | 现状（约） |
|--------|------------|
| Provider / Experience 分类 | manifest.category 已有；Runtime 不分支 |
| Bundled only | 已是（9 个官方插件已注册） |
| 9 Contributions Placement | Activity/View/Inspector/Command/Status/Slot 等已有；统一 Action 多表面未完 |
| Custom React / Declarative | 均为正式路径（ADR 0016）；K8s=Custom；mock 两边都有 |
| kubernetes apply 读路径 | **已接通**：hooks → apply-client → apply → `ctx.native.kubernetes`（IPC 名仅 native 层） |
| application-workspace + Slot | **已实现**（应用目录 apply + Explorer 选择 + Slot 组合；禁 Provider import） |
| docker | **独立 Provider**（declarative + apply；Engine socket 待 native） |
| git / ssh / jenkins / argocd / harbor | **独立 Provider**（mock catalog；native stub） |

推进时以本文件顺序为准，避免并行发明新 Plugin Type。
