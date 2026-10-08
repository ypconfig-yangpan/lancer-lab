# K8s Log Workbench（产品）

## 目的

定义开发者在 Lancer 里如何用 **Kubernetes 原生语义** 读日志、排障。  
这是工作台，不是资源浏览器，也不是集群日志采集平台。

## 心智：排障路径，不是资源树

借鉴 Rancher 的 **组织方式**，不借鉴 Logging Operator：

```text
Workload（如 Deployment）
    ↓
Pods（运行实例）
    ↓
Container
    ↓
Logs（Current | Previous）
```

用户想看的是「这个服务现在怎么了」，不是「随便点一个 Pod YAML」。

Dashboard 已有 Deployment 入口时，Logs 应挂在这条链上：切 Workload → 切 Pod → 切 Container → 读日志。

## 控件与能力（必须呈现 K8s 语义）

| 能力 | 说明 |
|------|------|
| Current / Previous | 当前容器 vs 上一容器（`previous`） |
| Container | 多容器 Pod 必选 |
| Since | 5m / 30m / 1h / … / all（替换写死的「只 tail 5000」心智） |
| Tail | 100 / 1000 / 5000 / all — 开流时历史深度 |
| Follow | 实时追加；离开底部时**不强拉回尾** |
| Pause | 暂停消费/追加展示（与 Follow 配合） |
| Search | 关键字；默认高亮并保留上下文；可切「只看命中」 |
| Next / Previous hit | Enter / ⇧Enter |
| Level filter | 有 level 元数据时过滤；没有则不强行假定 |
| Wrap / Copy | 长行与复制可见/命中 |
| ↓ N new lines | 离尾时显示新到行数；点击 Jump latest |
| Jump latest | 回到尾部并恢复 Follow |
| Time jump | 跳到某时刻附近（见 search-and-window-read） |
| Export visible | 当前数据窗口；文案诚实 |
| Export full | 本地 session 文件全量（Engine） |

## UI 约束

- **双窗口：** 只渲染 `read_window`（或等价）拿到的行；virtualizer 不做「百万对象藏 99%」
- 工具栏始终显示：Workload（若有）/ Pod / Container / Current|Previous / Follow 状态
- 与 Overview、Pods、Events、Terminal 同属排障上下文；Logs 是核心入口之一，不是孤立调试器

## 不做

- 集群级日志采集、外送、Logging Operator
- 为对齐 Docker 而抹掉 Previous / Since / Container
- Universal Log 导航（Nodes / 全资源浏览器式首页）——那是另一刀产品 IA，不在本文件范围

## 验收

- 从 Deployment 进入，能切 Pod / Container / Previous，打开即 Follow
- 滚上看历史出现「↓ N new lines」，点击回到尾部
- 全屏搜索 ERROR：高亮、上下条、不卡
- Since / Tail 改变后重开流，行为符合 K8s 预期

## 相关

- [history-live-resume.md](./history-live-resume.md)
- [search-and-window-read.md](./search-and-window-read.md)
- [ADR 0005](../adr/0005-large-log-architecture.md)
