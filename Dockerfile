# Один образ на всё приложение: Go-сервер API и nginx со статикой PWA.

# Сборка статического бинарника сервера: CGO не нужен, драйвер SQLite чистый Go.
FROM golang:1.26.0-alpine AS server-build
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ .
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# Сборка веб-клиента.
FROM node:22-alpine AS web-build
WORKDIR /app
COPY pwa-mobile-client/package.json pwa-mobile-client/package-lock.json ./
RUN npm ci
COPY pwa-mobile-client/ .
RUN npm run build

FROM alpine:3.21

# nginx работает без root: логи уходят в stdout/stderr контейнера, временные
# файлы пишутся в /var/lib/nginx, открытый на запись любому uid (ALL_CASH_DOCKER_USER).
RUN apk add --no-cache nginx tini \
    && adduser -D -u 10001 allcash \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log \
    && chmod a+rx /var/log/nginx \
    && chmod -R a+rwX /var/lib/nginx

COPY pwa-mobile-client/nginx.conf /etc/nginx/http.d/default.conf
COPY --from=server-build /out/server /usr/local/bin/server
COPY --from=web-build /app/dist /usr/share/nginx/html

# Рабочий каталог: сюда docker compose монтирует локальный каталог data с базой,
# поэтому файл базы лежит на диске хоста и переживает пересборку образа.
RUN mkdir -p /app/data && chown -R allcash:allcash /app
WORKDIR /app

USER allcash
ENV ALL_CASH_APP_DB_PATH=./data/all_cash.db ALL_CASH_SERVER_PORT=8000
# 8000 — API, 8080 — веб-клиент (nginx без root, поэтому не 80).
EXPOSE 8000 8080

# nginx в фоне, сервер — основной процесс: если сервер упал, контейнер завершается.
# tini -g пересылает SIGTERM всей группе, поэтому docker stop гасит оба процесса.
# Сервер сам создаёт таблицы при старте (CREATE TABLE IF NOT EXISTS).
ENTRYPOINT ["/sbin/tini", "-g", "--"]
CMD ["sh", "-c", "nginx -g 'daemon off; pid /tmp/nginx.pid;' & exec server"]
