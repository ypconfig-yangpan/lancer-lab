# Benchmark Plan

性能优化必须填下表，禁止只写「性能应该好」。Phase 0 建立计划与目录；**真实数字在 log engine / 连接接入后测量**。结果写入 `benchmarks/`（JSON 或 markdown run log）。

机器、OS、构建类型（debug/release）必须记录。对比用 **release** 构建。

列：

- **Baseline**：首次测得
- **Target**：方向性目标（可被数据修正）
- **Result**：本次
- **Regression**：相对 baseline 明显变差则不得作为 Release 依据

---

## Startup

| Case | Baseline | Target | Result | Regression |
|------|----------|--------|--------|------------|
| Cold start（可交互） | TBD | 方向 < 2s | | |
| Warm start | TBD | < cold | | |

启动不得立刻连全部 Cluster / 加载 Monaco / Terminal / ECharts。

---

## Memory

| Case | Baseline | Target | Result | Regression |
|------|----------|--------|--------|------------|
| Idle RSS | TBD | 持续测量 | | |
| 打开 Pod 列表页 | TBD | 相对 idle 有限增量 | | |
| 打开 Log Viewer（有界窗口） | TBD | JS Heap 有界 | | |
| 关闭 Log Viewer 后 | TBD | 回到接近打开前（允许少量碎片） | | |

---

## Logs（行数）

| Case | Baseline | Target | Result | Regression |
|------|----------|--------|--------|------------|
| 10K lines 可滚动 | TBD | 流畅 | | |
| 100K lines 可交互 | TBD | UI 不卡死 | | |
| 1M lines | TBD | 仅 Rust/Disk；JS 仍为窗口 | | |

---

## Large Files

| Case | Baseline | Target | Result | Regression |
|------|----------|--------|--------|------------|
| 100MB seek/read chunk | TBD | 不进 JS 全文 | | |
| 1GB search/export | TBD | streaming；JS 不吃 1GB | | |
| 5GB export | TBD | stream-to-file | | |

---

## Search

| Case | Baseline | Target | Result | Regression |
|------|----------|--------|--------|------------|
| Keyword 100K/1GB | TBD | 可取消；分页 hits | | |
| Regex（含恶意回朔样本） | TBD | 不卡死进程 | | |

---

## Stream

| Case | Baseline | Target | Result | Regression |
|------|----------|--------|--------|------------|
| 1 Pod follow 5 min | TBD | UI 内存不明显涨 | | |
| 3 Pods 5 min | TBD | 有界 | | |
| 10 Pods 5 min | TBD | 受并发上限约束 | | |
| 1 Pod 30 min | TBD | UI 不明显增长 | | |
| 3/10 Pods 30 min | TBD | 同上 | | |

---

## Lifecycle Leak

| Case | Baseline | Target | Result | Regression |
|------|----------|--------|--------|------------|
| Log tab open/close ×100 | TBD | 无单调 RSS 涨 | | |
| Terminal open/close ×100 | TBD | dispose；无泄漏 | | |
| Cluster switch ×50 | TBD | Watch/task 释放 | | |

---

## 门禁

关键版本对比 baseline：Startup、Idle RSS、100k logs、1GB search、多 stream。明显退化不得直接 Release。
