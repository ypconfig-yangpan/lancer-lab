# Tech Stack

锁定日期：2026-09-01。版本以 **lockfile** 为准；下表「当前」为仓库当时声明范围。

约定：TanStack Query 管 **Remote State**；Zustand 只管 **UI State**。禁止把 Remote 复制进 Zustand。

每个条目：**选什么 / 用在哪 / 为什么 / 不选什么 / 替代 / 当前 / 是否核心**。

---

## 选型表

| 技术 | 用在哪 | 为什么 | 不选 / 替代 | 当前 | 核心 |
|------|--------|--------|-------------|------|------|
| Tauri 2 | Desktop runtime、IPC、capability | 轻量、Rust 同进程、系统能力 | Electron / JavaFX / Flutter / NW.js | tauri 2.x，cli/api ~2.8–2.11 | 是 |
| React 19 | UI | 生态与 TanStack 匹配 | Vue/Svelte（无 ADR） | 19.1.x | 是 |
| TypeScript | 前端类型 | strict 契约 | 业务 JS | ~5.8 | 是 |
| Rust stable | Core | 性能、安全、kube-rs | 默认 nightly | rust-toolchain.toml stable | 是 |
| Vite | bundler | Tauri 官方路径 | Webpack/Next | 7.x | 是 |
| pnpm | 包管理 | workspace、lockfile | npm/yarn 无 ADR | packageManager 11.25 | 是 |
| Tailwind CSS 4 | 样式 | token + 密度 | 第二套 CSS 框架 | 4.1.x | 是 |
| shadcn/ui | Design System 组装 | 可复制、可改 | Ant/MUI 整套 | new-york / zinc | 是 |
| Radix UI | 无障碍原语 | 可访问 primitive | 业务直接依赖内部 class | 按组件（如 slot） | 是 |
| TanStack Router | 路由、URL 状态 | file-based、类型安全 | React Router | 1.131.x | 是 |
| TanStack Query | Remote/async | cache/retry/invalidation | 把 K8s 数据放 Zustand/Redux | 5.85.x | 是 |
| Zustand | UI store | 轻量、按领域拆 | Redux V1 | 5.x | 是 |
| React Hook Form | 复杂表单 | 少 re-render | 巨型受控表单 | 7.62.x | 是 |
| Zod | schema / DTO 边界 | 运行时校验 | 无校验强转 | **3.x**（ADR 0010，非 4） | 是 |
| TanStack Table | 资源表 | headless | 自研大表 | 8.21.x | 是 |
| TanStack Virtual | 日志/长列表 | 有界 DOM | 全量 DOM | 3.13.x | 是 |
| Monaco Editor | Raw YAML / Diff | 业界 YAML 编辑 | 启动即加载（禁止） | 未挂载；Phase 1 Raw 再接 | 核心能力，**懒加载** |
| xterm.js | Terminal 渲染 | K8s Exec 前端 | 本机 shell UI | `@xterm/xterm` **5.5.x**（ADR 0007 包名；非旧包 `xterm`） | 是 |
| Apache ECharts | 指标图 Phase 较后 | Canvas | 启动即加载 | **未加入依赖**；需要时懒加载 | 非 Phase 0 |
| Tokio | Rust async | 网络/K8s/IO | 第二 runtime | 1.x | 是 |
| kube-rs | K8s client | watch/stream/typed | 自研 REST | **已启用** kube 0.98 + k8s-openapi 0.24（v1_32） | 是（Phase 1） |
| k8s-openapi | K8s 类型 | 与 kube 配套 | 手写 schema | 随 kube | 是 |
| reqwest | 非 kube 的 HTTP（未来 registry 等） | rustls | 与 kube 内部 HTTP 抢第二套 | **未直接依赖**；kube 自带 client | Phase 较后 |
| rustls | TLS | 少 OpenSSL 绑定 | `accept_invalid_certs` 长期开 | 经 kube `rustls-tls` | 是 |
| tauri-plugin-stronghold | Credential | 安全存储 | localStorage/JSON | **未接入**；kubeconfig 仍走文件路径 | 是 |
| serde / serde_json | IPC DTO | camelCase 契约 | 内部 struct 当长期外部 API | 1.x | 是 |
| thiserror | 领域错误 | 类型化 | 业务 `anyhow::Error` | 2.x | 是 |
| tracing / tracing-subscriber / tracing-appender | 应用诊断日志、Span、daily rolling | 字段与 operationId；禁 println | log+env_logger 作为正式方案 | 0.1 / 0.3 / 0.2 | 是 |
| lucide-react | 图标 | 单一图标集 | 第二套 icon | 0.542.x | 否（UI） |
| i18next | 文案 | 禁止硬编码中文 | 散落字符串 | 25.x + react-i18next | 是 |
| date-fns | 时间展示 | 禁止 Moment | Moment.js | 4.x | 否 |
| tauri-plugin-store | UI preference | 非 Secret | everything.json / V1 SQLite | 2.x 待接 | 否 |

---

## 明确不使用（除非 ADR）

Electron、JavaFX、Next.js / SSR、Redux V1、XState V1、RxJS V1、SQLite V1、GraphQL、gRPC V1、Ant Design、MUI、Moment.js、自研 Kubernetes REST Client、V1 Docker Client、Global Event Bus、第二套 UI/CSS 框架。

---

## 替换规则

仅当库 deprecated / 明确不兼容时单点替换并写 ADR。不得整栈替换。生产构建禁止自动升级 dependency；提交 `pnpm-lock.yaml` 与 `Cargo.lock`。
