# ADR 0010: Zod Major Version for Phase 0

## Context

npm 上 Zod 最新为 4.x。React Hook Form resolvers 对 Zod 4 支持仍在演进；Phase 0 需要稳定的 schema validation 基线。

## Decision

Phase 0 锁定 **Zod 3.x**。

## Alternatives

- Zod 4：API 有 breaking changes，升级收益对当前无表单业务不明显。

## Consequences

- package.json 使用 `zod@^3.25`
- 后续升 Zod 4 需单独 ADR，并同步 `@hookform/resolvers` 与 schema 迁移
