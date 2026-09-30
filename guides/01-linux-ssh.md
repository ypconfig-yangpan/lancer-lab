# 01 主机、用户与 SSH

| 用户 | 职责 |
|---|---|
| `root` | 安装软件、系统配置 |
| `deploy` | CI：拷贝 jar、重启服务 |
| `servicea` | 运行 Java 进程（Linux 用户小写） |

```bash
ssh -i ~/.ssh/deploy_key deploy@app.example.com
systemctl status serviceA --no-pager
journalctl -u serviceA -n 50 --no-pager
```

## 检查清单

1. 使用 `deploy` 登录
2. 查看 `/opt/apps/serviceA/`
3. 目录可以叫 `serviceA`，系统用户则是 `servicea`
