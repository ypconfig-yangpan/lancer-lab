# 04 CI：push 只构建，Promote 再发布

参见 `.drone.yml`、`scripts/push_jar.sh`、`scripts/restart_app.sh`。

| 操作 | 结果 |
|---|---|
| `git push origin develop` | 仅 **build** |
| Drone **Promote**，环境填 `test` | **build → push_jar → restart_app** |

打开 Drone 页面 → 选中构建 → **Promote** → 环境 `test`（需与流水线里 `target: test` 一致）。

使用 arm64 Runner 时请保持 Mac Runner 在线。
