# serviceA

轻量 Spring Boot 示例服务。同类服务可放在 `apps/serviceB` …

```bash
cd ~/devops/apps/serviceA
mvn -B spring-boot:run
# http://localhost:8080/  → {"ok":"true","app":"serviceA"}
```

产物：`apps/serviceA/target/serviceA.jar`  
服务器（systemd）：`/opt/apps/serviceA/app.jar`  

本机 OrbStack K8s（和阿里云无关）：

```bash
orb start k8s
kubectl config use-context orbstack
# 在仓库根目录
docker build -t servicea:dev -f apps/serviceA/Dockerfile .
kubectl apply -f apps/serviceA/k8s.yaml
kubectl get pods,svc
# 浏览器看 Service 的 EXTERNAL-IP:8080
```

