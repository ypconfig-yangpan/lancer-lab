# Technical Debt

技术债必须登记。阶段编号用 Phase 0–6（见 ROADMAP），不要写含混的 P0。

| 日期 | 问题 | 原因 | 影响 | 计划阶段 |
|------|------|------|------|----------|
| 2026-09-29 | ADR 0017 Product-first；Plugin 平台冻结 | 审计成本无生态收益 | 新功能走 Capability；迁移见 V2_PLUGIN_MIGRATION_AUDIT | 渐进 |
| 2026-09-29 | features 已切 kubernetesApi；plugin 薄 host | apply 双轨 | Scale/Restart/Logs/Watch 不经 apply | 继续迁 Docker |
| 2026-09-03 | Stronghold / Store 未接入 | 1.7 明确仅 kubeconfig path reference | 凭证仍在用户文件 | Stronghold 或 OS keychain 后续切片 |
| 2026-09-01 | Monaco 已按需挂载（Inspector YAML Tab） | Phase 1 Raw YAML | ECharts 仍未接 | Phase 1 / 更后 |
| 2026-09-01 | xterm 已挂 Docker Terminal；K8s Exec 未做 | Docker exec 先落地 | 勿当 K8s Exec 已交付 | Phase 3 |
| 2026-09-04 | Docker lifecycle 写操作无 dry-run Diff | 本机 Engine 操作较轻 | 仅确认框 | 可接受 |
| 2026-09-04 | Docker exec 固定 `/bin/sh`，无 bash 回退 | 先通 TTY | 无 shell 容器会失败 | 后续可探测 |
| 2026-09-01 | list staleTime 未按 Kind 分级 | Watch 已 invalidate | 可再调优缓存 | Phase 1 |
| 2026-09-01 | Raw YAML 未做；Events 无独立 Watch UI 指示 | Phase 1 未完 | Inspector 无清单 | Phase 1 |
| 2026-09-01 | 诊断 zip 打包未做 | 仅 list 文件 + logDir | Export Diagnostics 不完整 | Phase 1 |
| 2026-09-01 | Benchmark harness 仅有清单 | 缺 log engine | 无回归数字 | Phase 2 |
| 2026-09-01 | Biome `recommended` 弃用告警 | 未 `biome migrate` | 未来大版本可能 break | 工具周 |
| 2026-09-01 | Feature 未完整 Vertical Slice | 骨架增长 | cluster-connect 已有 hook，其余仍散 | 每个新 feature |
| 2026-09-03 | 插件 UI 仍以整页 `factory` 为主；无 declarative Resource Table | 先跑通 Kernel | Docker 等无法复用统一展示 | ADR 0014；**mock Presenter 已通**；下一步迁 K8s Pod 表 |
| 2026-09-03 | `official.kubernetes` 仍手写 Pod/Deploy/Service Table | 历史 feature 切片 | 与 ADR 0014 双轨 | 先迁 Pod → Resource Table Presenter |
| 2026-09-02 | K8s Tauri commands 仍全局注册（进程内） | V1 bundled 同进程 | Disable 不能物理收回 IPC | 威胁模型已接受；外部插件后再 gate |
| 2026-09-03 | `ctx.native.docker` 已接 bollard（list/logs/exec） | Engine 桥已通 | 无 daemon 仍 mock | 保持 |
| 2026-09-03 | `ctx.native.git` / `ssh` 仍 NATIVE_UNAVAILABLE | 未接 libgit2 / SSH session | apply 用 catalog mock | 后续 native 桥 |
| 2026-09-03 | `ctx.native.jenkins` 仍 NATIVE_UNAVAILABLE | 未接 Jenkins HTTP API | apply 用 catalog mock | 后续 native 桥 |
| 2026-09-03 | `ctx.native.argocd` / `harbor` 仍 NATIVE_UNAVAILABLE | 未接远端 API | apply 用 catalog mock | 后续 native 桥 |
| 2026-09-04 | Docker stats 仅 one-shot、最多 24 个 running | 列表体验优先 | 无 sparkline / 持续采样 | 需要时再做 stream stats |
| 2026-09-04 | Docker logs 为 tail 拉取 + 轮询，非 follow 落盘 | 与 K8s managed-logs 路径分离 | 底栏非 Disk-as-Source | 可后续统一 LogSession |
| 2026-09-03 | 多 container / 搜索 / 大导出 | 2.2b 先单 container follow | 仅 tail+follow | 后续 Phase 2 切片 |
| 2026-09-03 | `create-stub-provider` 已无调用方 | P2–P6 已毕业 | 可删或留作脚手架 | MAY |
| 2026-09-02 | StatusBar PROD 左边框随 Core 收口暂时去掉 | 风险态仍在插件 Badge | PROD 视觉弱化 | ConnectionRef 进 Core 后恢复 |
| 2026-09-02 | K8s 命令仅在插件 active 后出现在 Palette | 无静态 command contribution | 未激活时搜不到 Open Logs | MAY |
| 2026-09-01 | `dirs` crate 解析 kubeconfig home | 与 Tauri path API 两套 | 可接受；统一 Path 策略 | MAY |
