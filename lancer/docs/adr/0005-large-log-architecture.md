# ADR 0005: Large Log Architecture

## Context

日志是一等公民。可能面对几十万行乃至 GB 级文件；不得拖垮 JS Heap 与 DOM。

## Decision

- Rust 负责文件、Seek、搜索、Regex、gzip、下载、导出、索引、stream
- React 只展示 Virtual List 可见块（TanStack Virtual）
- Chunk 传输（约 2k–10k 行，最终由 benchmark 决定）
- UI 使用 bounded buffer；超限后历史落本地文件
- 禁止把完整大日志读成 JavaScript String 或全部 render 到 DOM

## Alternatives

- textarea / 全量 state：实现简单，必然在大数据下崩溃。
- 仅前端 Worker 处理：仍占内存，且文件/Seek/凭证边界不清晰。

## Consequences

- Log Viewer 从 Phase 0 就必须 virtualization。
- 需建立 `benchmarks/` 并持续回归。
