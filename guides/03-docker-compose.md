# 03 Docker Compose

serviceA **不需要**数据库。Compose 只用来起 Drone（以及可能还留着的旧 MySQL/Redis）。

- Drone：`drone/docker-compose.yml`
- 旧库：`infra/`（可忽略）

Java 没有 Dockerfile：systemd + jar。
