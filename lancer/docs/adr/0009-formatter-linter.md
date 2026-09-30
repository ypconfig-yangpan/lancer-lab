# ADR 0009: Formatter / Linter

## Context

需要 format + lint，并避免 ESLint / Prettier / Biome 三方冲突。

## Decision

默认 **Biome**（format + 基础 lint）+ 专项 ESLint：

- `eslint-plugin-react-hooks`
- `@tanstack/eslint-plugin-query`

ESLint 不承担 formatter。

## Alternatives

- ESLint + Prettier：可行，但与 Biome 重叠。
- 仅 ESLint：format 体验较差。

## Consequences

- CI：Biome check + 专项 ESLint + `cargo fmt` + clippy。
- 若出现明确规则冲突，再 ADR 切换到 ESLint + Prettier。
