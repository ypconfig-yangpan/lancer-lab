# 本机用 OrbStack 开启 Kubernetes

在 Mac 上用 OrbStack 做本地实验；远端应用主机若仍是 systemd，可继续保持。

## 开启

OrbStack → **Settings → Kubernetes → Enable**，或：

```bash
orb start k8s
kubectl config use-context orbstack
kubectl get nodes
```

不用时：`orb stop k8s`。

## 与 Docker 的关系

本机 Docker 构建的镜像，可直接给 OrbStack 集群使用。

## 常用命令

```bash
kubectl get pods -A
kubectl apply -f some.yaml
kubectl logs deploy/xxx
kubectl delete -f some.yaml
```
