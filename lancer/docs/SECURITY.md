# Security

Desktop 持有与集群同等敏感的凭证。规则优先级：Security > 其它。完整工程条目见 [ENGINEERING_CONSTRAINTS.md](./ENGINEERING_CONSTRAINTS.md)；威胁分析见 [THREAT_MODEL.md](./THREAT_MODEL.md)。

---

## Credential

覆盖：kubeconfig 内容、bearer token、registry credential、未来 agent token。

- **MUST** 使用 Tauri Stronghold 或 OS 安全存储。
- kubeconfig **SHOULD** 存 Path Reference；若存内容，敏感字段进安全存储。
- **MUST NOT**：localStorage、sessionStorage、普通 JSON、明文配置、前端日志、console、Query Cache。
- React **MUST NOT** 拥有 Secret **value**。List Secret 默认 name / keys / metadata。Reveal 为显式操作；切页后重新隐藏。
- 复制 Secret **MUST** 显式动作；默认不得自动复制。清空剪贴板：MAY。

---

## Kubernetes

- 最小权限；危险按钮前 **SHOULD** SelfSubjectAccessReview（`canDeletePod` 等）。
- 支持 Readonly Cluster：禁全部 write Command。
- 危险操作确认；PROD 更强（删 NS/PVC、scale to 0、Apply YAML）。
- 稳定 ClusterId；危险 UI 始终展示 Cluster / Namespace / Resource。
- 默认显式 namespace；禁止意外 cluster-wide Delete/Patch/Exec/Logs。
- 结构化写优先 Patch；Conflict 不得静默覆盖。
- 禁止打开页面自动「修复」集群；V1 不是 Controller。
- 生产默认验证 TLS；`accept_invalid_certs` 不得作为长期方案；开发 insecure 必须明显标识。

---

## Tauri

最小 Capability。**MUST NOT**：`shell:allow-all`、`fs:allow-all`、全磁盘 unrestricted。

FS Scope 精确到应用数据与用户选定日志目录。Shell V1 关闭。Kubernetes Terminal = Exec，不是本机 shell。开放任意本地命令必须 ADR。

---

## Secret Redaction

日志、错误、Diagnostics、Crash Report、`tracing` 字段 **MUST** 脱敏，至少：token、password、authorization、clientSecret、accessKey、secretKey、privateKey。禁止 Debug 完整 kubeconfig。禁止 `tracing::error!(?config)` 一类可能含凭证的整对象 dump。实现：Rust `shared::redact`，前端 logger 上报前同样处理。

应用诊断日志目录、级别、滚动、Error Boundary / panic hook 见 [DIAGNOSTICS.md](./DIAGNOSTICS.md)。

---

## Diagnostics / Telemetry / Update

Diagnostics：App logs、version、OS、cluster **metadata**、非 secret settings、error traces。**绝不**含 Token / Secret value / Private Key。

V1 **MUST NOT** 采集用户行为 Telemetry。未来若加：Opt-in、透明、可关闭。

Crash Report：默认关闭敏感上传，必须先 Redact。

更新包：明确流程；正式发布需签名（开发阶段可暂缓）。

---

## 校验

前端 Zod 不等于安全边界。K8s 写操作 Rust 必须再校验。外部输入（K8s API、文件、kubeconfig、用户、未来 Agent）均不可信。
