# V1 UI Shell 布局约定

> 状态：**2026-09-30 修订**（Mock Dashboard 产品页）。与 [LAYOUT_SYSTEM.md](./LAYOUT_SYSTEM.md)、[ADR 0017](../adr/0017-product-first-capabilities.md) 一致。  
> 改 Shell 结构须显式修订本文；禁止 Marketplace；禁止为先验 Application/Environment 加壳。

## 1. 产品方向

当前主路径 = **窄侧栏 + 全宽 Dashboard/详情**（K8s / Docker / Jenkins mock）。  
旧 IDE 三栏（Explorer 树 / Inspector / Bottom Dock）代码可保留，**UI 默认不再启用**。

```text
┌──────────┬─────────────────────────────────────────────────┐
│ 窄侧栏    │ 主区顶栏（标题/面包屑 · Search · 用户占位）        │
│ Lancer   ├─────────────────────────────────────────────────┤
│ K8s      │ 全宽 Workspace：Dashboard 或 Detail（模块内路由） │
│ Docker   │                                                 │
│ Jenkins  │                                                 │
│ Settings ├─────────────────────────────────────────────────┤
│          │ Status Bar（可极简）                              │
└──────────┴─────────────────────────────────────────────────┘
```

**现行约定：**

- 侧栏只挂 **Kubernetes / Docker / Jenkins**；数据层 **全部 mock**（不连 OrbStack / 本地 Docker / 真 Jenkins）。
- 详情在主区内切换，不依赖 Inspector Panel。
- 日志在 Dashboard/Detail 内嵌暗色区块展示 mock 行。

## 2. 区域职责

| 区域 | Core | Capability |
|------|------|------------|
| 窄侧栏 | 工具切换 | Activity |
| 主区 | 顶栏 Search、ViewHost | Dashboard / Detail 全页 |
| Status Bar | 条带 | 可选极简 |

## 3. 交互

- 侧栏同时仅一个 Active 工具。
- 模块内 Dashboard ↔ Detail 用本地 route store。
- 写操作按钮可展示，动作为 toast/noop（mock 期）。

## 4. 禁止

Marketplace、先验 Application/Environment 壳、把真实凭证写入可提交文件。

## 5. 演进

真集群 / 本地 Docker / Jenkins HTTP 接入时，替换 mock store，尽量不改壳。
