# Search and Window Read

## 目的

大日志上的 **定位** 与 **取内容** 分离，避免 IPC 被全文轰炸。

引擎选型、ripgrep crates、Search Cursor、取消、与 Follow 解耦见 **[search-architecture.md](./search-architecture.md)**（本文只定契约与时间跳转/导出）。
## 边界（死规定）

| 操作 | 返回 |
|------|------|
| **Search** | 命中 **行号列表**（+ totalHits / truncated），**不返回正文** |
| **Read** | `read_window` / `read_around(line)` → 有界正文行 |

```text
Search("ERROR")
  → { matches: [18392, 18395, 18401], totalHits, truncated }
         ↓
read_window / read_around(18392)
  → 附近 Log 行（数据窗口）
         ↓
Viewer 高亮 + 滚动
```

## Search（Rust）

输入（概念）：

- `sessionId`
- `keyword` 和/或 `regex`
- `caseSensitive`（可选）
- `levels`（可选；无 level 的行在按 level 过滤时排除或忽略——实现选定一种并文档化；推荐：无 level 则不匹配 level 过滤）
- `from` / `to` 时间（可选；无 timestamp 的行在按时间过滤时 **排除**，并统计「无时间戳行数」供 UI 提示）
- `limit`：最多返回多少个命中行号

行为：

- 流式扫盘（可配合稀疏索引跳段，非必须第一刀）
- 命中上限（如 5k）；超出则 `truncated: true`
- **禁止**把匹配正文列表经 IPC 回传

前端窗口内即时过滤（仅当前数据窗口）可做 keyword/level，语义与 Rust 子串规则对齐；**regex 只走 Rust**，避免 JS/Rust 方言不一致。

## Window Read

- `read_window(sessionId, offset, limit)` — offset 为 session 内 0-based 或与 lineNumber 约定一致（实现必须单一约定，推荐与现有 DTO 对齐）
- 跳转命中：由 lineNumber 换算 offset，再读窗口，Viewer 滚到目标行

## Time Jump

百万行时「跳到某时刻」优于翻页：

```text
用户选时间 T（或点时间轴）
  ↓
在文件中定位 timestamp ≥ T 的最近行（可采样 + 局部扫描；稀疏索引可辅）
  ↓
read_window 围绕该行
  ↓
Display
```

无足够 timestamp 时：禁用或降级提示，不得假装精确。

## Export

- **Visible：** 当前数据窗口 → 前端或小 IPC；文件名含 ns_pod_container_时间
- **Full：** 复制/另存 managed-log 文件；行数 ≈ totalLines

## 验收

- 全盘搜 ERROR：IPC 载荷只有行号量级，非全文
- 点击命中 → 窗口内容正确、高亮正确
- Time jump 在有 timestamps 的流上可用
- Full export 完整

## 相关

- [storage-and-index.md](./storage-and-index.md)
- [k8s-log-workbench.md](./k8s-log-workbench.md)
- [ai-context-collection.md](./ai-context-collection.md)
