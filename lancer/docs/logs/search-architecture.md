# Lancer Log Search Architecture

> Status: Proposed  
> Scope: Kubernetes Log Search / Local Persisted Log Search  
> Priority: High

---

## 1. 目标

Lancer 的日志搜索不是简单的：

```text
输入关键词
↓
string.contains()
```

也不是重新实现一个 grep。

Lancer 应该复用成熟的 Rust 搜索能力，把工程重点放在：

* 大日志文件搜索
* Search → Match → Context
* 行号 / byte offset 定位
* Search Cursor
* Read Window
* K8s 日志上下文
* IPC 数据量控制
* Search 取消与生命周期管理

核心原则：

> **不要重新实现成熟的搜索算法。**  
> **底层搜索能力优先复用 ripgrep 的 Rust crates。**  
> **Lancer 负责日志工作台语义，而不是重新发明 grep。**

与 [search-and-window-read.md](./search-and-window-read.md) 一致：**Search = Locate，Read = Fetch。**

---

## 2. 核心设计

```text
                    User
                     │
                     ▼
               Search Query
                     │
                     ▼
              Lancer Search (Rust)
                     │
                     ▼
          ripgrep Rust Search Stack
                     │
          ┌──────────┴──────────┐
          │                     │
      Plain Text              Regex
          │                     │
          └──────────┬──────────┘
                     ▼
                  Matches
                     │
          ┌──────────┴──────────┐
          │                     │
      line number          byte offset
          │                     │
          └──────────┬──────────┘
                     ▼
              Read Window
                     │
                     ▼
              Log Context
                     │
                     ▼
                Lancer UI
```

搜索和读取必须分离。实现挂在现有 `managed-log` 上，**不**另起跨工具 `LogProvider`，**不**用 `Command::new("rg")`。

---

## 3. Search ≠ Read

搜索负责：**找到在哪里。**  
读取负责：**把用户真正需要看的内容取出来。**

```text
Search("OOMKilled")
→ matches: { line, byte_offset }[]

Click line 294821
→ readWindow(centerLine = 294821, before = 100, after = 100)
→ 上下文行
```

第一阶段 **不要**把完整日志文本放进 SearchResult。

---

## 4. 为什么复用 ripgrep crates

优先研究并复用（以 Cargo 实际版本为准）：

```text
grep-searcher
grep-matcher
grep-regex
```

必要时：`regex`、`memchr`、`aho-corasick`。

不要自己实现：grep 算法、Regex engine、SIMD 扫描、mmap 优化、literal optimization、backtracking 防护。

---

## 5. 不要启动 rg 子进程

不推荐 `Command::new("rg")` 解析 CLI stdout。

推荐：进程内调用 ripgrep crates → 直接拿到 line / byte offset、可取消、无跨平台 CLI 差异。

Lancer 是 Desktop Runtime，核心能力不建立在外部 CLI 上。

---

## 6. Search API（概念）

```rust
search(source, query, mode, options, cursor) -> SearchResult
```

- **source**：当前 managed-log 文件 / session  
- **query**：用户输入  
- **mode**：`PlainText` | `Regex`  
- **options**：`case_sensitive`、`max_matches`；`context_before/after` 留给 Read，不必塞进 Search 默认返回  
- **cursor**：搜索进度（见下）

```rust
SearchResult {
    matches: Vec<SearchMatch>,  // line_number + byte_offset
    next_cursor: Option<SearchCursor>,
    has_more: bool,
}
```

---

## 7. Search Cursor

不能一次性搜完全文件并把全部结果进内存 / IPC / React。

增量示例：`limit = 100`，返回 `matches` + `next_cursor` + `has_more`。

Cursor 内部可用 `byte_offset` 或 `line_number + byte_offset`；**不暴露**给前端实现细节，**不依赖** React index。

UI 可显示 `17 matches` 或 `17+`（完整数量未知时不要为凑总数扫完 10GB）。

---

## 8. Plain Text / Regex

- PlainText：最快路径（literal / memchr 等），不要以「逐行 `contains`」作为最终引擎。  
- Regex：成熟 Rust regex；**不要**引入灾难性 backtracking 引擎。  
- 前端窗口内即时过滤可做简单子串；**全盘 regex 只走 Rust**。

---

## 9. Sparse Index 与 Search 的关系

两者职责不同，不要混成一个组件：

| 能力 | 问题 |
|------|------|
| Search | 关键词在哪里？→ line / offset |
| Sparse Index | 已知行号，如何快速读到？→ seek |

```text
Search → line number → Sparse Index → seek → Read Window
```

**实现顺序说明（与刀序对齐）：**

- **Read 路径**尽早上稀疏索引：修复「每次从文件头扫」的轮询债务（见 [storage-and-index.md](./storage-and-index.md)）。  
- **Search 路径**第一阶段可以是 buffered sequential + ripgrep crates；命中后用索引 seek 读窗。  
- 不要为 Search 单独上 Tantivy / ES / SQLite FTS。

---

## 10. Read Window

命中后读上下文（如 before/after 各 100 行）。  
这也是以后 [AI Context Collection](./ai-context-collection.md) 的基础：

```text
Search → Match → Read Window → Context → UI（或以后 Text→AI）
```

---

## 11. UI 关系

UI 不理解底层算法，只做：

```text
Search → Matches → Current Match → Read Context
Enter / ⇧Enter → Next / Previous
Click Match → Read Window + Scroll
Esc → Close Search
```

---

## 12. Search 与 Follow 解耦

Follow 与 Search 并行：Search **不得**锁住 Log Stream，不得因搜索停止实时落盘/跟尾。

```text
Live Stream ──► Storage ──► Viewer
Search     ──► Search task（可取消）
```

---

## 13. Cancellation

新查询必须取消旧任务，避免 ERROR 扫 10GB 未完时用户已改成 OOM 仍占 CPU/IO。

---

## 14. 第一阶段不做倒排索引

```text
Buffered Sequential Search + ripgrep crates
```

足够。日志模式是「写入 → 偶尔搜 → 读上下文」，不是百万次复杂检索。

倒排会带来 Index Build/Update/Consistency/Rebuild——当前无收益。

---

## 15. 演进路线

| 阶段 | 内容 |
|------|------|
| V1 | ripgrep crates + sequential + Plain/Regex + Cursor + Read Window |
| V2 | Sparse Line Index + Seek（Read 优先；Search 命中后定位） |
| V3 | 仅当 benchmark 不够：Chunk / Bloom / Parallel |
| V4 | 仅当重复查询极多：再考虑 Tantivy / SQLite FTS5 |

不要提前实现 V3/V4。

---

## 16. Benchmark（要建）

规模：`1MB / 10MB / 100MB / 1GB / 10GB`（按机器能力取子集也可）。

场景：Plain/Regex Hit·Miss、Many/Few Matches、Long Lines、Unicode。

指标：latency、throughput（**GB/s**）、peak memory、CPU、IPC payload size。  
文件大小不同时，只看 ms 没有意义。

---

## 17. 明确禁止（第一阶段）

- 自己实现 grep / Regex engine  
- `rg` CLI 子进程作核心实现  
- Elasticsearch / Tantivy / SQLite FTS  
- 全文件进内存  
- Search 返回完整正文 / 一次百万 Match  
- 前端维护搜索结果全集  
- Search 阻塞 Follow / Stream  

---

## 18. 最终链路（示意）

```text
Log Viewer
    ↓ Search / Navigate
Search (Rust) → ripgrep crates → line / byte offset → Cursor
    ↓
Sparse Index → seek → Read Window → Context
    ↓
Human UI          （以后）AI Context Text
```

---

## 19. 原则摘要

1. **不要自己造搜索算法** — 站在 ripgrep / Rust regex 上。  
2. **Search Locate，Read Fetch** — 不混。  
3. **Line Number = 用户语义，Byte Offset = 机器定位。**  
4. **Search Cursor 优于一次返回全部结果** — 可取消、可继续。  
5. **Search 与 Follow 解耦。**  
6. **先 Sequential Scan，后按需加重索引。**  
7. **Lancer 的价值不是另一个 grep** — 找到 → 定位 → 上下文 → 浏览 →（以后）理解 / AI。

## Related

- [search-and-window-read.md](./search-and-window-read.md)  
- [storage-and-index.md](./storage-and-index.md)  
- [history-live-resume.md](./history-live-resume.md)  
- [ai-context-collection.md](./ai-context-collection.md)  
- [ADR 0005](../adr/0005-large-log-architecture.md)  
