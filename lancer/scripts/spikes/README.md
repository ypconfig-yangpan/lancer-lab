# Spikes

验证最危险技术点。通过后才能放心扩业务。

| Spike | 脚本 | 目标 | 状态 |
|-------|------|------|------|
| 1 IPC | `scripts/spikes/01-ipc-contract.sh` | typed facade + AppErrorDto | 待跑 |
| 2 K8s | `scripts/spikes/02-k8s-connect.sh` | connect + list ns/pods | 待跑（需 k3d 夹具） |
| 3 Logs | `scripts/spikes/03-large-log-chunk.sh` | 100万行分块 + 有界 window | 待跑 |

开发集群：

```bash
bash scripts/k8s/bootstrap-dev-cluster.sh
```
