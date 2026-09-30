# Coding Standards

本文件是 Lancer 强制编码标准。新增、修改、重构必须遵守。

- 新代码遵循本规则。
- 不为了「统一风格」无意义重写整个模块。
- 重构必须保持行为不变。
- 规则明显不适用于某个场景时，先写 ADR，不允许静默绕过。

Cursor 规则镜像：仓库根 `.cursor/rules/lancer-*.mdc`。

规则级别与工程约束见 [ENGINEERING_CONSTRAINTS.md](./ENGINEERING_CONSTRAINTS.md)。冲突时 Security > Data Integrity > Correctness > Performance > Maintainability > Developer Convenience。

## 核心原则

Readable > Clever。Explicit > Magic。Typed > Stringly Typed。Bounded > Unbounded。Composition > Inheritance。Domain Meaning > Framework Terminology。

React 管 UI。Rust 管 native 工作。Tauri IPC 是边界，不是捷径。

## 分层

| 层 | 职责 |
|----|------|
| React / TypeScript | UI 与交互 |
| Tauri IPC | Adapter Boundary |
| Rust | Desktop 核心能力 |

Rust 负责：Kubernetes API、文件系统、日志 Stream、大文件、搜索、Regex、压缩、Credential、系统能力。

React 不得直接承担：Kubernetes 协议、大日志全文处理、大文件扫描、Credential 存储、长时间后台任务、大量 CPU 计算。

不把 Rust 功能搬到 TS 只为了实现更快；不把本应在 React 的 UI 逻辑搬到 Rust。

编码前先读 `docs/ARCHITECTURE.md`、`PRODUCT_MODEL.md`、`PERFORMANCE.md`、`SECURITY.md`、`DIAGNOSTICS.md` 与现有实现。

---

## TypeScript

`tsconfig` 至少开启：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true
  }
}
```

禁止为了消灭报错关闭 strict。禁止业务 `.js`、禁止无约束 `latest`、禁止 `@ts-ignore`（特殊情况必须写原因）。

禁止 `any`。优先 `unknown` 再明确解析。只有与无法正确声明类型的第三方库交互时允许局部 `any`，并必须：

```ts
// TODO(types): third-party library has no usable type declaration
```

禁止无意义类型断言，尤其 `value as unknown as Pod`。边界数据必须 schema 校验，例如 `PodSchema.parse(value)`。

DTO 与 View Model 分离：IPC 返回 `PodDto` / `DeploymentDto` / `AppErrorDto`；UI 使用 `PodView` / `DeploymentView`。不要让 Kubernetes 原始结构直接污染所有 UI。

复杂状态用 Discriminated Union，避免多 boolean 拼出非法组合。

`undefined` = 未提供 / 不存在该字段；`null` = 明确为空。API DTO 必须明确语义。

函数参数避免 boolean trap：用对象参数（`follow` / `previous` / `timestamps`）。函数保持单一职责：优先拆成 API / Mapper / Use Hook / UI Action。

命名：Component `PodTable`；Hook `usePodLogs`；Boolean `isConnected`；事件 `handlePodSelect`。不要 `doThing` / `processData` / `handleData`。

TODO 必须可追踪：`// TODO(perf): replace linear scan after log index V2 is introduced.` 注释解释 WHY，不解释 WHAT。

## React

只用 Function Component。Component = 展示与交互；Hook = 组合逻辑；Query = async；Store = UI；API = IPC。禁止组件直接 `invoke`、读大文件、解析 kubeconfig。

Component 必须 Pure：不在 render 中产生外部副作用；不修改 props / state / 外部变量。禁止在 render 内用 `Date.now()` / `Math.random()` / `crypto.randomUUID()` 作为稳定业务值。

Hook 只允许在 React Function Component 或 Custom Hook 顶层。禁止条件、循环、事件回调、try/catch 内调用 Hook。

禁止把 `useEffect` 当流程编排器。优先 TanStack Query dependency、Event Handler、Explicit Command、Derived State。Effect 主要负责与外部系统同步、订阅、监听、生命周期资源清理。

不保存 Derived State：filter 等直接计算或必要时 `useMemo`。不滥用 `useMemo` / `useCallback`：仅明确性能热点、依赖引用稳定性、Virtual List / Table、benchmark 证明必要时使用。

Server State（Pods / Deployments / Services / Events）用 TanStack Query，不进 Zustand。Zustand 只放当前 Workspace、Panel Layout、Tabs、Theme、当前 Selection、Local UI Preference。

出现多个独立业务区块、JSX 难以快速理解、同时负责查询 + 转换 + 大量 UI 时再拆组件。不要为了「每个组件必须 100 行以下」机械拆分。

Hook 命名表达业务能力：`usePodLogs`、`useClusterConnection`。避免 `useData` / `useCommon` / `useUtils`。

表单：React Hook Form + Zod。写操作前端校验后，Rust 必须重新校验。

## IPC

页面只调用 `src/shared/tauri/*` typed API。Command 必须薄：DTO 校验 + Use Case 调度。重活必须 `async`。双边 typed，Rust `#[serde(rename_all = "camelCase")]`。

Command 命名（Rust snake / TS camel 对齐同一意图）：Query `list_pods` / `listPods`；Command `scale_deployment` / `scaleDeployment`。Command = 请求响应；流式优先 Channel / Stream。

禁止巨大 IPC payload。日志使用 stream / channel / chunk / file。普通页面只返回 Summary；Raw Manifest 页才允许完整 YAML / JSON。避免把巨型 ManagedFields 全部推给 UI。React 不接收 `anyhow::Error` debug string；统一 `AppErrorDto { code, message, detail, retryable }`。

## Rust

命名遵循标准惯例。Public API 写 rustdoc（purpose、error behavior、constraints）。

不写 Java 风格（`PodManager` / `PodServiceImpl` / `AbstractPodFactory`），除非领域确实需要。Trait 只用于真正的抽象边界（Kubernetes Gateway、Credential Store、Filesystem Adapter、Clock）。只有一个实现且没有测试替换价值时，优先 concrete type。

只读输入优先 `&str` / `&Path` / `&[u8]`。转换命名：`as_xxx` / `to_xxx` / `into_xxx`。优先 `From` / `TryFrom` / `AsRef`。

Error 必须类型化（`thiserror`）。禁止业务路径 `unwrap` / `expect`（测试、启动期 invariant、逻辑已严格证明不可能失败除外）。Public 可能失败操作返回 `Result<T, E>`。anyhow 仅允许 CLI / 启动组装层；核心业务不用 `Result<T, anyhow::Error>`。

Tokio 做网络 / K8s / async IO。禁止在 async runtime 中直接执行大型 blocking 操作；必要时 `tokio::task::spawn_blocking`。所有长任务必须可取消（Pod Log Stream、Download、Search、Export、Watch、Exec）。关闭 Tab 必须能停止任务。

Channel 优先于大范围共享锁。禁止全项目一把 `Arc<Mutex<AppState>>`。Lock 不跨 await。有业务约束的字段优先 private。Enum 优于 magic string。易混淆 ID 可用 Newtype，不要所有 `String` 都 newtype。

**unsafe：** 业务代码禁止 `unsafe`。若需要：独立模块、注释、ADR、单独测试。默认 unsafe-free。

**panic：** 业务路径不得用 panic 处理 Network / File / K8s / User Input。panic 仅 invariant / 编程错误。

`cargo fmt` + `clippy`（warnings = error）。

## 性能

JS Heap 必须有界。日志采用 bounded window + local file + virtual list，禁止无限 `setLogs(prev => [...prev, line])`。高频日志 buffer 后 50ms / 100ms batch（以 benchmark 为准）。

大文件永远不完整进入 JS（例如 10MB / 50MB 以上，阈值 benchmark 后确定）。React 只请求 range / page / chunk / search result。全文检索与 Regex 在 Rust。

## 依赖新增清单

1. 标准库能否解决？
2. Tauri 官方 Plugin 能否解决？
3. 现有依赖是否已覆盖？
4. 是否仍在维护？
5. 是否造成 UI Framework 重复？
6. 长期升级成本是否值得？

大依赖必须 ADR。

## 应用诊断日志

Desktop **自身**运行日志 ≠ Pod 业务日志。详见 [DIAGNOSTICS.md](./DIAGNOSTICS.md)。

禁止把 `println!` / `eprintln!` / `console.log` 当正式日志方案。Rust 使用 tracing，React 使用统一 logger；生产错误和重要操作由 Rust 持久化到滚动日志文件；所有日志必须遵守敏感信息脱敏规范。写操作用 `OperationId` 贯穿 Span。详见 [DIAGNOSTICS.md](./DIAGNOSTICS.md)。

## Quality Gates

Frontend：`pnpm typecheck`、`pnpm lint`、`pnpm test`。

Rust：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test`。
