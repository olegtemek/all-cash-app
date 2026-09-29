package http

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/olegtemek/all-cash-server/internal/config"
)

// maxBodyBytes ограничивает тело запроса на уровне сервера: батч push с потолком
// APP_PULL_LIMIT укладывается в этот размер с большим запасом.
const maxBodyBytes = 10 << 20

const healthCheckTimeout = 2 * time.Second

type Server struct {
	usecase     Usecase
	corsOrigins []string
	router      http.Handler
	http        *http.Server
}

func New(uc Usecase, cfg config.Config) *Server {
	server := &Server{usecase: uc, corsOrigins: cfg.Server.CORSOrigins}
	server.router = server.routes()
	server.http = &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      server.router,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}
	return server
}

func (s *Server) Handler() http.Handler { return s.router }

func (s *Server) ListenAndServe() error {
	err := s.http.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (s *Server) Shutdown(ctx context.Context) error {
	return s.http.Shutdown(ctx)
}

func (s *Server) routes() http.Handler {
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.Recoverer)
	router.Use(s.logging)
	router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.corsOrigins,
		AllowedMethods:   allowedMethods,
		AllowedHeaders:   allowedHeaders,
		ExposedHeaders:   exposedHeaders,
		AllowCredentials: false,
		MaxAge:           preflightMaxAge,
	}))
	router.Use(s.limitBody)

	router.Get("/health", s.handleHealth)
	router.Post("/auth/login", s.handleLogin)
	router.Post("/auth/register", s.handleRegister)

	router.Group(func(secured chi.Router) {
		secured.Use(s.authorize)
		secured.Get("/pull", s.handlePull)
		secured.Post("/push", s.handlePush)
		secured.Get("/export/csv", s.handleExportCSV)
	})
	return router
}
