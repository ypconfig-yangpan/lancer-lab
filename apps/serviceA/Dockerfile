# 在仓库根目录构建：
#   docker build -t servicea:dev -f apps/serviceA/Dockerfile .
FROM docker.m.daocloud.io/library/maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY ci/maven-settings.xml /root/.m2/settings.xml
COPY apps/serviceA/pom.xml apps/serviceA/pom.xml
COPY apps/serviceA/src apps/serviceA/src
RUN mvn -B -s /root/.m2/settings.xml -f apps/serviceA/pom.xml package -DskipTests

FROM docker.m.daocloud.io/library/eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/apps/serviceA/target/serviceA.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-Xms64m", "-Xmx256m", "-jar", "/app/app.jar"]
