# Jenkins → Lancer 事件（Webhook 主路径 + 轮询兜底）

## 模型

```text
Jenkins --Webhook--> Lancer(本机 :18765) --> jenkins-build-event --> UI
       \--REST-----/  (丢事件 / 未配置时 Activity 轮询合成同样事件)
```

## 配置 `~/.lancer/jenkins.json`

见 [jenkins.local.json.example](./jenkins.local.json.example)。

- `webhook.enabled`：默认 `true`，连接后监听 `127.0.0.1:{port}`
- `webhook.port`：默认 `18765`
- `webhook.token`：可选；设置后请求需带 `X-Lancer-Token` / `Authorization: Bearer` / `?token=`

Webhook URL：`http://127.0.0.1:18765/jenkins/webhook`（也接受 `/webhook/jenkins`）

## 推荐 body（Lancer 原生）

```json
{
  "event": "BuildStarted",
  "jobFullName": "sly2.0/api-server",
  "number": 128,
  "result": "RUNNING"
}
```

完成：

```json
{
  "event": "BuildCompleted",
  "jobFullName": "sly2.0/api-server",
  "number": 128,
  "result": "SUCCESS",
  "durationMs": 154000
}
```

兼容 Notification Plugin 风格：`{ "name": "job", "build": { "number": 1, "status": "STARTED" } }`。

## Jenkins 侧怎么配

1. **同机 / 能打到本机**：Job 通知或 pipeline `httpRequest` POST 到上面的 URL。
2. **Jenkins 在另一台机器、Lancer 在 Mac**：需局域网可达（把 `127.0.0.1` 换成 Mac IP），或以后再做中继；优先同网直连。
3. **未配 Webhook**：仍靠 REST 轮询兜底合成 `BuildStarted` / `BuildCompleted`，UI 行为一致，只是延迟约 2.5s。

## 事件名

| Tauri event | 用途 |
|-------------|------|
| `jenkins-build-event` | 领域事件（Webhook 或 Poll） |
| `jenkins-activity` | 队列/执行器快照（Poll） |
