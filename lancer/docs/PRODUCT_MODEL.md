# Product Model

> 更新 2026-09-29。  
> **原则：先集成，后抽象。** 先把工具接进来、用顺；产品模型从真实使用里长出来，不坐在架构图前猜。  
> 技术路线：[ADR 0017](./adr/0017-product-first-capabilities.md)。迁移：[V2_PLUGIN_MIGRATION_AUDIT.md](./V2_PLUGIN_MIGRATION_AUDIT.md)。

---

## 一句话

```text
Lancer
  → 连接各种 DevOps
  → 把能力集中起来
  → 让用户更快地操作
```

不是插件平台，也不是先造 Application / Environment / Project 空域模型。

---

## 当前阶段做什么

把各工具 **直接** 接成 Capability 工作区，把这一条链做顺：

```text
连接 → 浏览 → 查看 → 操作 → 日志 → Exec → 实时状态
```

### 工具清单（按实现深浅推进，不是一次做完）

```text
Kubernetes
├── Cluster
├── Namespace
├── Pods / Deployments / Services
├── Logs / Exec / Watch
└── Operations（Scale / Restart / …）

Docker
├── Containers
├── Logs / Exec
└── Operations（Start / Stop / …）

Git（后做真实现）
├── Repository / Branch / Commit
└── Operations

Jenkins（后做真实现）
├── Jobs / Builds / Logs
└── Operations
```

首页可以很朴素：

```text
Connections
├── Kubernetes → production
├── Docker → local
├── Git → …
└── Jenkins → …
```

点进去就是该工具的工作区。

---

## 和代码怎么对齐

| 工具 | 现状（约） | 下一阶段 |
|------|------------|----------|
| Kubernetes | 连接 / 列表 / Watch / YAML / Logs / Exec / Scale·Restart·UpdateImage·Delete；Deploy→关联 Pods；宽侧栏导航；走 `kubernetesApi` | 体验打磨 |
| Docker | 列表 / Logs / Exec / lifecycle；Images·Volumes 列表·Delete（Images 含 Pull）；`dockerApi`；引擎状态 / 筛选 / 刷新 | 体验打磨 |
| Git / Jenkins / … | mock / native unavailable | 有需要再真接，仍按「工具工作区」 |

技术模块名：`capabilities/{kubernetes,docker,…}` = **内建工具能力**，不是第三方 Plugin。  
**代码已有：** `capabilities/connections`（Connections 入口，与 PRODUCT 首页心智对齐）。

---

## 暂时不做什么

- 不先定义刚性的 Application / Environment / Project 域模型再开干  
- 不做 Plugin Marketplace / 第三方生态  
- 不为「将来可能」抽空泛化层  

Application Workspace 等 mock **仅演示**，不代表产品模型已交付。

---

## 以后何时抽象

用一段时间后，若真实行为稳定出现例如：

- 「我总是先找某几个固定连接 / 现场」  
- 「K8s 和 Jenkins 经常一起操作」  
- 「总按同一组服务名筛选」  

再从行为里长出模型（可叫 Environment、Application、还是别的——**到时候再命名**）。

在此之前：加功能 = **把某个工具的连接→浏览→操作链做深**。

---

## Runtime 与 Session（仍值得保留的薄概念）

这两类不是「猜出来的业务中心」，而是做工具时几乎必须有的：

| 概念 | 作用 |
|------|------|
| **Runtime 事实** | Pod / Deployment / Container… Summary 列表 + 按需 YAML |
| **Session** | LogSession / ExecSession / WatchSession — 长连接、可取消、断线可见 |

写操作继续：意图型 Operation（scale/restart/…）+ 确认；PROD 强确认。

---

## 导航心智（V1）

1. **Connections / 工具入口**（主）  
2. 工具内：Cluster/Engine → 范围（如 NS）→ 资源表 → Inspector / Logs / Exec  
3. Resources Advanced、跨工具编排 — 后置  

旧 [ui/INFORMATION_ARCHITECTURE.md](./ui/INFORMATION_ARCHITECTURE.md) 若仍写 Application 默认导航，**以本文为准**。
