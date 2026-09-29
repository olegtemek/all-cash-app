package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/olegtemek/all-cash-server/internal/config"
	"github.com/olegtemek/all-cash-server/internal/repository"
	httptransport "github.com/olegtemek/all-cash-server/internal/transport/http"
	"github.com/olegtemek/all-cash-server/internal/usecase"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to read config", "error", err.Error())
		os.Exit(1)
	}

	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel(cfg.App.LogLevel)}))
	slog.SetDefault(log)

	repo, err := repository.New(cfg.App.DBPath)
	if err != nil {
		log.Error("failed to open database", "error", err.Error())
		os.Exit(1)
	}
	defer repo.Close()

	uc := usecase.New(repo, cfg.App.PullLimit)
	server := httptransport.New(uc, cfg)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	errs := make(chan error, 1)
	go func() {
		log.Info("server started", "port", cfg.Server.Port)
		errs <- server.ListenAndServe()
	}()

	select {
	case err := <-errs:
		if err != nil {
			log.Error("server stopped with error", "error", err.Error())
			os.Exit(1)
		}
	case <-ctx.Done():
		log.Info("shutdown signal received")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Error("graceful shutdown failed", "error", err.Error())
			os.Exit(1)
		}
		log.Info("server stopped")
	}
}

func logLevel(name string) slog.Level {
	switch strings.ToLower(name) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
