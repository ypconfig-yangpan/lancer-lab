# Session Keepalive（Active / Suspended）

权威规范见 [viewer-session-architecture.md](./viewer-session-architecture.md)。

## 干什么

关掉 / 折叠 Log 视口时进入 **SUSPENDED**：

1. **物理断开** kube follow（停流，省资源）
2. **保留** L2 本地 Cache 文件
3. 记录最后一行时间戳；启动 **45s TTL**
4. 45s 内再开 → **Re-attach**：秒读 L2 + `sinceTime` 补增量 → ACTIVE

> 旧「Detached 仍跟流」已废弃：关窗不再后台常驻拉日志。

## 状态

| 状态 | 含义 |
|------|------|
| **Active** | `attach_count ≥ 1`；正在推流 |
| **Suspended** | 视口已关；`abort` 已掐断；L2 仍在；TTL 计时 |
| **Teardown** | abort（若仍有）、删临时文件与索引、移出 map |

## Session 指纹

```text
connectionId + namespace + pod + container
+ containerId + previous + sinceSeconds + tailLines
```

改 Tail / Since / Previous → 新指纹 → 新 Session；旧 Suspended 走 TTL/LRU。

## 参数

| 项 | 值 |
|----|-----|
| TTL | **45s** |
| Max Suspended | **2**（LRU） |

`managed_logs/mod.rs`：`GRACE_TTL` / `MAX_DETACHED`。

## 调用链

```text
openLogs
  → try_reattach(fingerprint)?
       → fromCache；若 needs_stream：start_kube_follow(sinceTime=last_ts)
  → 否则 open_for_stream + start_kube_follow(Tail/Since)

closeLogs / 折叠 Idle
  → suspend：attach_count--；到 0 则 abort 流 + TTL
```

## 主页

`openWhenExpanded`：Idle 不拉流；打开 → ACTIVE；收起 → SUSPENDED。
