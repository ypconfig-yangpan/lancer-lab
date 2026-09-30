# 参与贡献

欢迎改进 Lancer。

## 开发

```bash
cd lancer
pnpm install
pnpm tauri dev
pnpm test && pnpm lint && pnpm typecheck
```

## 提交说明

- 提交信息请使用**中文**，说清「为什么改」
- 改动尽量聚焦；行为变化时补充文档
- 不要提交密钥（Token、私钥、真实 `.env`、含有效证书的 kubeconfig）
- 示例配置请用占位符（如 `REPLACE_WITH_...`、`example.com`）

## 安全问题

涉及敏感信息的漏洞，请勿直接发公开 Issue，优先私下联系维护者。
