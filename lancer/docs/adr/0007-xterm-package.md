# ADR 0007: Terminal Package Name

## Context

规范写的是 xterm.js。npm 上旧包名 `xterm` 已迁移到 scoped 包 `@xterm/xterm`，插件同步为 `@xterm/addon-*`。

## Decision

使用 **`@xterm/xterm`** + `@xterm/addon-fit` / `search` / `web-links`。这是同一项目的官方包名更替，不是技术栈替换。

## Alternatives

- 继续依赖旧 `xterm` 包名：可能停止更新。
- 其他终端渲染库：无必要。

## Consequences

- 文档与依赖表使用 `@xterm/xterm`。
- Terminal protocol / K8s exec 仍在 Rust；前端只渲染。
