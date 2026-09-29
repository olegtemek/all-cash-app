include ../.env
export

# Пути в .env считаются от корня проекта, а make запускается из backend/.
ifneq ($(filter-out /%,$(APP_DB_PATH)),)
APP_DB_PATH := ../$(APP_DB_PATH)
endif

.PHONY: run migrate

run:
	mkdir -p $(dir $(APP_DB_PATH))
	go run ./cmd/server

migrate:
	mkdir -p $(dir $(APP_DB_PATH))
	go run ./cmd/migrate
