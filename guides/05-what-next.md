# 建议顺序：先 CI/CD，再 Kubernetes

先把「构建 → 发布 → 运行」跑通，再引入集群控制台。

## 在本仓库可以完成

1. 推送 `develop` → Drone **build**（不自动上线）
2. **Promote `test`** → `push_jar` → `restart_app`
3. 看日志：`./scripts/app_logs.sh` / `journalctl -u serviceA`
4. 主机防火墙 / 安全组放行 8080
5. 用同样方式增加 `apps/serviceB`（另一端口）

目标：不依赖集群界面，也能说清「构建」和「发布」是两步。

## 下一步（仍可不装 K8s）

- 容器镜像：Dockerfile 包装 jar
- 配置与密钥：思路同 Drone Secrets
- 健康检查与回滚（`app.jar.bak`）

## 再往后（托管 Kubernetes）

| 工具 | 用途 |
|---|---|
| 云厂商控制台（如 ACK） | 集群 / 节点 / 负载均衡 |
| **kubectl** + **k9s** / **Lens** | Pod、日志、进入容器 |
| **Argo CD** 或流水线 `kubectl apply` | Git 驱动发布 |

```text
现在：jar  → systemd serviceA → :8080
以后：镜像 → Deployment/Pod → Service/Ingress
现在：journalctl
以后：kubectl logs
现在：Drone Promote
以后：更新镜像 tag + 滚动发布
```

小规格机器可继续用 systemd；K8s 建议放到单独环境。
