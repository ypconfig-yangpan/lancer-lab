# Lancer 日志查看器 — 架构与交互规范

定位：**轻量级桌面端按需排障工具**（On-demand Diagnostic Viewer），不做后台常驻全量采集器（Collector）。

核心解耦：**Viewer（视口）** 与 **Session（数据上下文）** 生命周期分离。

- Viewer 易失：关窗 / 折叠只影响 UI。
- Session 短时缓存：本地临时文件 + 指纹；关窗 ≠ 立刻销毁 Session。

## 1. 三层存储（禁止混淆「行数」）

| 层 | 名称 | 位置 | 角色 |
|----|------|------|------|
| **L1** | Tail / Since | K8s API | 建联参数：初次开流向集群索取多深 |
| **L2** | Session Cache | `managed-logs/` 临时文件 | 当前查看上下文已缓存全文；清空视口**不删**此层 |
| **L3** | Viewport Limit | 前端虚拟列表 | 内存防爆；向上滑只从 L2 滑动读取 |

对照实现：[read-window.md](./read-window.md)（L3）、[storage-and-index.md](./storage-and-index.md)（L2）、本页 Session 状态机（L1↔L2）。

## 2. Session 状态机

```text
用户打开 Log Viewer
        │
        ▼
校验 Session Fingerprint
   ┌────┴────┐
 命中 Cache   未命中
   │           │
   ▼           ▼
本地秒开     建 K8s Stream（Tail/Since）
+ sinceTime    写入 L2
补增量
   └────┬────┘
        ▼
  State: ACTIVE
  （UI 渲染 + Follow）
        │
 关闭 / 折叠窗口
        ▼
  State: SUSPENDED
  - 物理断开 K8s 长连接（停流）
  - 保留 L2 临时文件
  - 记录最后一行时间戳与行号
  - 启动 45s TTL
        │
   ┌────┴────────────────┐
 45s 内再开            超时 / LRU / 换集群
   │                       │
 Re-attach               EXPIRED / TEARDOWN
 本地视图 + 增量追流      删临时文件 + 释放内存
 → ACTIVE
```

实现落点：`ManagedLogStore`（Active / Suspended / destroy），见 [session-keepalive.md](./session-keepalive.md)。

## 3. Session 指纹（Cache Key）

必须完全匹配：

```text
ClusterId + Namespace + PodName + ContainerName
+ ContainerId + IsPrevious + Tail/Since
```

- **ContainerId**：CrashLoop 重建后指纹失效 → 自动新开 Session。
- 原地改 Tail / Since：变更检索意图 → **跳过复用**，销毁当前 Session，重写 L2，重新开流。

## 4. 关键交互

### 4.1 开关与复用

- 30–45s 内频繁开关：读 L2 秒开，无全量重拉。
- 重连 K8s：`sinceTime = 最后一行时间戳` 补齐离线增量，再 Follow。

### 4.2 清空（Clear）✅

- **仅**视口软隐藏（Soft Viewport Mask），**不删** L2。
- UI：折叠历史，插入 `--- 视口已清空 [点击恢复历史] ---`；新日志在分割线下追加。
- 状态栏：`● 实时跟随 | 视口已隐藏历史 (本地已缓存 N 行)`。
- 实现：`log-viewer.tsx` → `clearMaskAt`；见 [read-window.md](./read-window.md)。

### 4.3 滚动与 Auto-Follow

- 向上滚离底 > 50px → 停 Follow；浮条「⬇ 回到最新 · 恢复实时 (有 N 条新日志)」。
- 到顶加载更早：只滑 L2，**不**打 K8s。

### 4.4 改 Tail / Since

- 选择器旁微提示：「变更拉取参数将重新拉取历史并重置会话」。

## 5. 状态栏文案（忌黑话）

| 状态 | 文案 |
|------|------|
| 吸底 Follow | `● 实时跟随 \| 本地已缓存 N 行 (渲染最新 M 行)` |
| 历史浏览 | `⏸ 已暂停跟随 \| 查看历史第 A ~ B 行 / 共 N 行` |
| 补流中 | `⟳ 正在补齐增量日志...` |

不用：「读窗末」「偏移量」等实现黑话。

## 6. 后端结构（逻辑名）

```text
SessionFingerprint  →  LogSessionKey（含 container_id）
SessionStatus       →  Active | Suspended（detached_at / abort=None）
LogSession          →  SessionState + managed-logs 文件
```

## 7. 与主页 UI

- Idle 假终端 +「打开日志」：未 ACTIVE 前不建流。
- 窄栏精简头；Since/Tail 全屏再露（仍属 L1 建联参数）。
