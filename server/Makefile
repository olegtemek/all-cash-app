include ../.env
export

# Пути в .env считаются от корня проекта, а make запускается из backend/.
ifneq ($(filter-out /%,$(ALL_CASH_APP_DB_PATH)),)
ALL_CASH_APP_DB_PATH := ../$(ALL_CASH_APP_DB_PATH)
endif

.PHONY: run

run:
	mkdir -p $(dir $(ALL_CASH_APP_DB_PATH))
	go run ./cmd/server
