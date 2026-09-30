# 在 Kubernetes 上运行 serviceA（对照说明）

## Docker 与 Kubernetes

- **Docker**：构建镜像，并在单机 `docker run`
- **Kubernetes**：按 YAML 在多节点调度容器、故障拉起、提供稳定访问入口

本机单节点 Kubernetes（OrbStack / Docker Desktop / kind）与托管集群（如 ACK）API 相同，但是不同环境。

## 对应关系

```text
现在                          以后（K8s）
mvn package                   Dockerfile → 镜像
scp 到 /opt/apps/serviceA     推到镜像仓库
systemd 启动 java -jar        Deployment
放行 :8080                    Service / Ingress
journalctl -u serviceA        kubectl logs
Drone Promote                 换镜像 tag + 滚动发布
```

## 本机选项

| 环境 | 用途 |
|---|---|
| OrbStack / Docker Desktop / kind | 本地写 YAML、练 kubectl |
| 云托管 Kubernetes | 更接近生产 |

## 最少需要的三样

1. 镜像：`FROM eclipse-temurin:21-jre` + jar + `java -jar`
2. Deployment：副本数 + 镜像
3. Service：集群内端口；对外再加 Ingress 或云负载均衡

```bash
kubectl apply -f k8s/
kubectl get pods,svc
kubectl logs deploy/servicea
```

CI 随后变为 `docker build && docker push`，Promote 改为更新 Deployment 镜像 tag，而不再 scp jar。
