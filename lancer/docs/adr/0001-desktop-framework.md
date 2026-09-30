# ADR 0001: Desktop Framework

## Context

需要跨平台 Desktop GUI，强调轻量、低内存、本地文件与系统能力。候选：Electron、Tauri、Flutter Desktop、JavaFX、NW.js。

## Decision

采用 **Tauri 2.x** + Rust stable。第一阶段优先 macOS，生产构建需覆盖 macOS / Windows / Linux。

## Alternatives

- Electron：生态成熟，但内存与包体显著更大，不符合轻量目标。
- Flutter / JavaFX / NW.js：与「React 体验层 + Rust 重活」边界不匹配，或生态/打包成本更高。

## Consequences

- 前端是 WebView + React，后端是 Rust binary。
- 需维护 Tauri Capability 与 IPC 契约。
- 开发机需要 Rust toolchain（项目内 `rust-toolchain.toml` 钉 stable）。
