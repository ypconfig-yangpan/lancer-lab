# Lancer

面向 DevOps / Kubernetes 的桌面端运维工作台（Tauri + React + Rust）。

## 文档

- [路线图](docs/ROADMAP.md)
- [架构](docs/ARCHITECTURE.md)
- [产品模型](docs/PRODUCT_MODEL.md)
- [安全](docs/SECURITY.md)
- [UI](docs/ui/README.md)

## 开发

```bash
pnpm install
pnpm tauri dev
pnpm test && pnpm lint && pnpm typecheck
```

## 打包

```bash
pnpm tauri build --bundles dmg   # macOS
pnpm tauri build --bundles nsis  # Windows
```
