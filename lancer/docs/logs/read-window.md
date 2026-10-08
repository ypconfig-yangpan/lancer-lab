# 滑动 Read Window（L3 渲染视口）

正式模型。对照 [viewer-session-architecture.md](./viewer-session-architecture.md) 三层：本页只谈 **L3**。

## 概念

| 层 | 名称 | 谁管 |
|----|------|------|
| L2 | Session Cache（磁盘） | Rust managed-logs |
| L3 | Read Window（渲染） | 前端虚拟列表 |

- **阅读窗大小**（2k / 5k / 10k / 20k）：内存中最多渲染多少行，**不是**磁盘上限，也不是集群 Tail。
- 向上滚到顶：从 L2 **滑动**窗口（重叠保留一段），**不**打 K8s。

## Follow / 上滚

- Follow ON：窗口贴尾；批量刷新（≥50ms）。
- 用户上滚脱离底部：Follow OFF；Stream（ACTIVE 时）仍写 L2；底部 `⬇ 回到最新 · 恢复实时 (有 N 条新日志)`。
- 回到最新：贴尾 + Follow ON。

## Clear（软隐藏，主路径）

「清除」= **Soft Viewport Mask**，不是删日志：

- 视口隐藏 `lineNumber ≤ mask` 的历史行；**L2 不动**
- 插入分割行：`--- 视口已清空 [点击恢复历史] ---`
- 新日志在分割线下继续 Follow
- 状态栏：`● 实时跟随 | 视口已隐藏历史 (本地已缓存 N 行)`
- 工具栏旋转图标 / 点分割线文案 → 恢复历史

实现：`LogViewer` 的 `clearMaskAt`。

## 禁止

- 加载更早时把阅读窗从 5k 堆到 10k / 20k / …
- 把「阅读窗口」说成「最多只能看这么多行日志」
- Clear 时删除磁盘或掐断 ACTIVE 流

## 相关

- [storage-and-index.md](./storage-and-index.md)
- [viewer-session-architecture.md](./viewer-session-architecture.md)
- [history-live-resume.md](./history-live-resume.md)
