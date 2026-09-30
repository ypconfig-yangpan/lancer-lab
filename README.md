# Lancer

**Lancer** 是面向 DevOps / Kubernetes 的桌面端工作台。

技术栈：[Tauri](https://tauri.app/) + React + Rust。

## 功能

- 粘贴 kubeconfig 连接 Kubernetes
- 按 Namespace 浏览工作负载（Deployment / Pod）
- Jenkins 任务查看与本机凭证配置
- 支持打包 macOS（`.dmg`）与 Windows（NSIS）

## 快速开始

```bash
cd lancer
pnpm install
pnpm tauri dev
```

### 打包

```bash
# macOS
pnpm tauri build --bundles dmg

# Windows（需 Windows 环境或 CI）
pnpm tauri build --bundles nsis
```

Windows CI：GitHub Actions → **Lancer Windows** → **Run workflow**。

## 仓库结构

| 路径 | 说明 |
|------|------|
| [`lancer/`](./lancer) | 桌面应用（主产品） |
| [`apps/serviceA/`](./apps/serviceA) | 示例 Spring Boot 服务 |
| [`guides/`](./guides) | 部署与运维说明 |
| [`drone/`](./drone) | 可选的 Drone CI 示例 |
| [`.github/workflows/`](./.github/workflows) | GitHub Actions |

## 文档

入口：[lancer/docs/ROADMAP.md](./lancer/docs/ROADMAP.md)

更多架构、安全与 UI 文档见 [`lancer/docs/`](./lancer/docs)。

## 参与贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

[MIT](./LICENSE)
