# Сборка статических бинарников: CGO не нужен, драйвер SQLite чистый Go.
FROM golang:1.26.0-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.21

RUN adduser -D -u 10001 allcash
COPY --from=builder /out/server /usr/local/bin/server

# Рабочий каталог: сюда docker compose монтирует локальный каталог data с базой,
# поэтому файл базы лежит на диске хоста и переживает пересборку образа.
RUN mkdir -p /app/data && chown -R allcash:allcash /app
WORKDIR /app

USER allcash
ENV ALL_CASH_APP_DB_PATH=./data/all_cash.db ALL_CASH_SERVER_PORT=8000
EXPOSE 8000

# Сервер сам создаёт таблицы при старте (CREATE TABLE IF NOT EXISTS).
CMD ["server"]
