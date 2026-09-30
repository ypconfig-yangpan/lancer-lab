# UI 文档

Lancer 的 **UI 规范目录**。来源：DevOps Desktop UI 设计包，已纳入仓库并与架构文档对齐。

原则：

> OrbStack 级简单 + IDE 级信息密度 + Kubernetes 级能力。  
> 日常 Application-first；Kind 浏览器只给专家。

## 阅读顺序

1. [UI_IMPLEMENTATION_SPEC_V1.md](./UI_IMPLEMENTATION_SPEC_V1.md) — **实现级视觉 SoT**（+ [references/](./references/)）
2. [../adr/0002-react-ui-stack.md](../adr/0002-react-ui-stack.md) — **UI 技术栈锁定**（Tailwind/Radix/shadcn → `@lancer/ui`）
3. [SHELL_FREEZE.md](./SHELL_FREEZE.md) — Shell 结构冻结
4. [UI_REFERENCE.md](./UI_REFERENCE.md) — 学谁、不抄谁
5. [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md) — 导航与信息架构
6. [LAYOUT_SYSTEM.md](./LAYOUT_SYSTEM.md) — Shell / 面板 / Tab
7. [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) — Token / 组件说明
8. [INTERACTION_GUIDELINES.md](./INTERACTION_GUIDELINES.md) — 快捷键与交互
9. [PLUGIN_VIEW_CONTRIBUTION.md](../PLUGIN_VIEW_CONTRIBUTION.md) — Placement 契约

## 当前实现焦点

```text
UI Stack ✅ 已锁定（ADR 0002）
→ 补齐 @lancer/ui（Radix 增量按需）+ Shell 视觉
→ official.mock / 各 Plugin catalog mock 对齐参考图
→ 再接真实 API（k8s / docker …）
```

`@lancer/ui` ≡ `@devops-desktop/ui` → `src/ui/`。

## 与阶段

| 文档里的能力 | 阶段 |
|--------------|------|
| Application 默认导航 | Phase 4 完整；此前可用 Namespace + 列表权宜 |
| Resources 专家视图 | Phase 1 起逐步加 Kind |
| Logs Workspace | Phase 2 |
| Operations 面板 | Phase 3 |
| GitOps / Argo 视觉 | Phase 6，不得扭曲 V1 |

## Cursor

实现 UI 时优先对照本目录与 `.cursor/rules/lancer-*.mdc`。
