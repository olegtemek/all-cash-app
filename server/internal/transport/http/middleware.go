package http

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/olegtemek/all-cash-server/internal/models"
	"github.com/olegtemek/all-cash-server/internal/usecase"
)

const (
	sessionHeader = "Authorization"
	bearerPrefix  = "Bearer "
)

// preflightMaxAge — время в секундах, на которое браузер кеширует ответ на preflight.
const preflightMaxAge = 600

var (
	allowedMethods = []string{http.MethodGet, http.MethodPost, http.MethodOptions}
	allowedHeaders = []string{"Content-Type", sessionHeader}
	exposedHeaders = []string{"Content-Disposition"}
)

type contextKey int

const (
	sessionKey contextKey = iota
	logEntryKey
)

type session struct {
	userID string
	login  string
}

type logEntry struct {
	UserID   string
	Since    *int64
	NextSeq  *int64
	Records  *int
	Accepted *int
	Rejected *int
}

func (s *Server) authorize(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := bearerToken(r)
		if !ok {
			respondErrorCode(w, models.CodeInvalidToken)
			return
		}

		user, err := s.usecase.Authenticate(r.Context(), token)
		if errors.Is(err, usecase.ErrInvalidSession) {
			respondErrorCode(w, models.CodeInvalidToken)
			return
		}
		if err != nil {
			s.fail(r, w, err)
			return
		}

		if entry := logEntryFrom(r.Context()); entry != nil {
			entry.UserID = user.ID
		}

		ctx := context.WithValue(r.Context(), sessionKey, session{userID: user.ID, login: user.Login})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func bearerToken(r *http.Request) (string, bool) {
	header := strings.TrimSpace(r.Header.Get(sessionHeader))
	if len(header) <= len(bearerPrefix) || !strings.EqualFold(header[:len(bearerPrefix)], bearerPrefix) {
		return "", false
	}
	return header[len(bearerPrefix):], true
}

// limitBody отклоняет запрос, заявивший слишком большое тело, и обрезает тело без
// Content-Length. Ошибку обрезанного тела хендлеры распознают через http.MaxBytesError
// и отвечают тем же кодом payload_too_large.
func (s *Server) limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ContentLength > maxBodyBytes {
			respondErrorCode(w, models.CodePayloadTooLarge)
			return
		}
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		entry := &logEntry{}
		ctx := context.WithValue(r.Context(), logEntryKey, entry)
		r = r.WithContext(ctx)

		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		started := time.Now()
		next.ServeHTTP(recorder, r)

		fields := []any{
			"method", r.Method,
			"path", r.URL.Path,
			"status", recorder.status,
			"duration_ms", time.Since(started).Milliseconds(),
			"user_id", entry.UserID,
		}
		if entry.Since != nil {
			fields = append(fields, "since", *entry.Since)
		}
		if entry.NextSeq != nil {
			fields = append(fields, "next_seq", *entry.NextSeq)
		}
		if entry.Records != nil {
			fields = append(fields, "records", *entry.Records)
		}
		if entry.Accepted != nil {
			fields = append(fields, "accepted", *entry.Accepted)
		}
		if entry.Rejected != nil {
			fields = append(fields, "rejected", *entry.Rejected)
		}
		slog.InfoContext(r.Context(), "request handled", fields...)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status  int
	written bool
}

func (w *statusRecorder) WriteHeader(status int) {
	if w.written {
		return
	}
	w.status = status
	w.written = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusRecorder) Write(data []byte) (int, error) {
	if !w.written {
		w.written = true
	}
	return w.ResponseWriter.Write(data)
}

func sessionFrom(ctx context.Context) (userID, login string) {
	value, ok := ctx.Value(sessionKey).(session)
	if !ok {
		return "", ""
	}
	return value.userID, value.login
}

func logEntryFrom(ctx context.Context) *logEntry {
	entry, _ := ctx.Value(logEntryKey).(*logEntry)
	return entry
}
