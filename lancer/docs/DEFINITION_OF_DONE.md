# Definition of Done

一个 Feature 不是「页面能显示」就算完成。

## 最低清单

- [ ] 正常状态
- [ ] Loading
- [ ] Empty
- [ ] Error（含可复制 detail）
- [ ] Permission denied（若涉及 K8s）
- [ ] Cancellation（长任务）
- [ ] Cleanup（关 Tab / 卸载后 Task 停止）
- [ ] Typed（无业务 `any`，IPC DTO 对齐）
- [ ] `pnpm typecheck && pnpm lint && pnpm test`
- [ ] `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`
- [ ] 无明显无界内存增长（日志/stream/watch）

## Logs / Terminal / Watch 额外

- 关闭 Tab 后 Rust Task **必须**结束
- UI buffer 有界；磁盘为源
- 丢失 / 断开对用户可见

## 审查用语

禁止只说「完成」。必须写：过了哪些闸门、未覆盖哪些状态。
