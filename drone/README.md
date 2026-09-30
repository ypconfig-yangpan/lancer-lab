# Drone（可选）

Drone Server + Docker Runner 的示例布局。请把主机名和密钥换成你自己的环境。

## 配置

复制 `.env.example` 为 `.env`，填写：

- `DRONE_SERVER_HOST`
- `DRONE_RPC_SECRET`
- Gitee / GitHub OAuth 的 client id 与 secret

## Mac Runner

```bash
export DRONE_RPC_HOST=your-drone-host.example.com
export DRONE_RPC_SECRET=...
bash drone/start-mac-runner.sh
```

## 写入部署 Secrets

```bash
export DRONE_SERVER=https://your-drone-host.example.com
export DRONE_TOKEN=...
export DRONE_REPO=owner/repo
export DEPLOY_HOST=your-app-host.example.com
export SSH_KEY_FILE=~/.ssh/deploy_key
bash drone/create-secrets.sh
```
