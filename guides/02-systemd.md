# 02 systemd

对照：`apps/serviceA/serviceA.service` → 服务器 `/etc/systemd/system/serviceA.service`

- `User=servicea`
- `ExecStart=... -jar /opt/apps/serviceA/app.jar`
- `Restart=on-failure`

CI 的 `restart_app` 就是 `sudo systemctl restart serviceA`。

看日志（和本地 `mvn spring-boot:run` 的控制台类似）：

```bash
# 服务器上
journalctl -u serviceA -n 100 --no-pager
journalctl -u serviceA -f          # 持续跟着刷

# 本机
./scripts/app_logs.sh
```
