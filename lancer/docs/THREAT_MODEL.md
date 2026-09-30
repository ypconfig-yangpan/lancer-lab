# Threat Model

简单威胁模型（非合规认证文档）。资产是集群等价物。缓解必须可执行，对应 [SECURITY.md](./SECURITY.md)。

---

## Assets

| Asset | 为何敏感 |
|-------|----------|
| Kubernetes credentials / kubeconfig | 等同集群管理员或部署权限 |
| Logs | 可能含 token、PII、业务数据 |
| Terminal | 容器内任意命令 |
| Secrets | 明文凭证 |
| Cluster metadata | 拓扑与攻击面 |

---

## Entry Points

Tauri IPC、WebView、Kubernetes API、Filesystem、Clipboard、Updater、Future Agent。

---

## Threats

| Threat | Risk | Impact | Mitigation |
|--------|------|--------|------------|
| Credential Leak | High | 集群被接管 | Stronghold；禁 localStorage/JSON/日志；Redact；React 无 secret value |
| Privilege Escalation | High | 超出用户意图的写 | SSAR；Readonly；Command 表达意图；禁隐式 reconcile；禁本机 shell |
| Malicious Manifest | High | 破坏集群 | Dry-run + Diff；PROD 确认；server-side validation；禁静默 apply |
| Unsafe Terminal | High | 容器沦陷 | 仅 K8s Exec；不自动 root；session 隔离；断开可见 |
| Path Traversal | Med | 读/写用户机敏感文件 | PathBuf；FS scope；禁手拼 `/` |
| Log Injection | Med | 伪造诊断、钓鱼 | 展示转义；Redact；不把日志当 HTML |
| Command Injection | High | 本机或集群被控 | 无任意 shell；IPC typed；不拼接 kubectl 字符串 |
| Dependency Supply Chain | Med | 供应链植入 | lockfile；audit；禁止 `*`；License 检查 |
| MITM | High | 凭证/流量被截 | rustls 校验；禁长期 insecure TLS |
| Insecure TLS | High | 同 MITM | 生产强制校验；dev insecure 明显标识 |
| Malicious Update | High | 整机/凭证失守 | 签名/公证（正式发布）；明确更新流程；企业可关自动更新 |

---

## 非目标（V1）

企业级审计平台、零信任认证中台、把 Desktop 做成多租户 SaaS。
