# Lancer v2 去 Plugin 化迁移审计

> **状态：DONE / superseded（2026-09-29）**  
> 产品路径已落地为 **Capabilities + ShellModuleRegistry**，不再走 Plugin 平台。  
> 现行规范：[PRODUCT_MODEL.md](./PRODUCT_MODEL.md)、[ADR 0017](./adr/0017-product-first-capabilities.md)。  
> 下文为历史迁移清单，仅供对照残留代码；**勿再按「待迁」推进新 Plugin 切片**。

---

## 现状（已落地）

| 项 | 状态 |
|----|------|
| `capabilities/connections` | **live** — Connections 入口 |
| `capabilities/kubernetes` | **live** — `kubernetesApi` / Exec 等 |
| `capabilities/docker` | **live** — `dockerApi` 等同构中 |
| `ShellModuleRegistry`（`src/shell/`） | **live** — Activity/View/Command 注册，无 Manifest |
| `PluginManager` / Manifest / `apply` | **已删或正在删除** — 禁止新代码依赖 |

**最小替代（已实现）：** 静态 `import` capability → `register(registry)`。无 Marketplace、无第三方 Plugin。

---

## 历史清单（归档）

以下各节为迁移前只读审计；标签含义仍见原表，但**执行已完成或转清理残留**。

### 标注含义（历史）

| 标签 | 含义 |
|------|------|
| **删除** | 目标态不再存在 |
| **迁 capabilities** | → `src/capabilities/{域}/` |
| **迁 native** | → `src/native/` |
| **迁 shell** | → `src/shell/` |
| **保留** | v2 仍需要 |
| **暂不动** | 双轨期旧路径（现应清理） |

### 1–10 节摘要

- **plugin-kernel**：PluginManager / lifecycle / catalog / apply / loader → **删除**；registries → Shell；native → `native/`。
- **plugins/**：kubernetes / docker → **capabilities/**；mock 与其余 official → Demo 或删，勿扩。
- **features/**：已迁 kubernetes / shell。
- **app**：`registerCapabilities()` + `ShellModuleRegistry` 替代 plugin-bootstrap。
- **不要做**：Marketplace / SDK / Sandbox / 为 Kernel 保留 PluginContext / Application 空域模型。

完整路径级表格已不再维护；以仓库当前 `src/capabilities/*` + `src/shell/*` 为准。
