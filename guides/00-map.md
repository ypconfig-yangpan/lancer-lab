# 总览：代码如何变成正在运行的服务

```text
修改 apps/serviceA
        │
        │  git push origin develop
        ▼
     仅构建
        │
        │  Drone Promote（环境：test）
        ▼
     scp jar + 重启 serviceA
```

之后可增加 `apps/serviceB`（独立端口、systemd 单元，脚本用 `APP_NAME=serviceB`）。

| 主题 | 位置 |
|---|---|
| 应用 | `apps/serviceA/` |
| 流水线 | `.drone.yml` |
| systemd | `apps/serviceA/serviceA.service` |
