package http

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/olegtemek/all-cash-server/internal/models"
	"github.com/olegtemek/all-cash-server/internal/usecase"
)

type Usecase interface {
	Login(ctx context.Context, login string) (models.User, error)
	Register(ctx context.Context, login string) (models.User, error)
	Authenticate(ctx context.Context, login string) (models.User, error)
	Pull(ctx context.Context, userID string, since int64, limit int) (usecase.PullOutput, error)
	Push(ctx context.Context, userID string, input usecase.PushInput) (models.PushResult, error)
	ExportCSV(ctx context.Context, userID string) ([]byte, error)
	Health(ctx context.Context) error
}

type errorBody struct {
	Error errorPayload `json:"error"`
}

type errorPayload struct {
	Code    models.ErrorCode `json:"code"`
	Message string           `json:"message"`
}

func respond(w http.ResponseWriter, status int, body any) {
	if body == nil {
		w.WriteHeader(status)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func respondError(w http.ResponseWriter, status int, code models.ErrorCode, message string) {
	if message == "" {
		_, message = models.ErrorStatus(code)
	}
	respond(w, status, errorBody{Error: errorPayload{Code: code, Message: message}})
}

func respondErrorCode(w http.ResponseWriter, code models.ErrorCode) {
	status, message := models.ErrorStatus(code)
	respondError(w, status, code, message)
}

// decodeJSON читает тело запроса в target. Возвращает false, если ответ об ошибке уже
// отправлен: тело либо не разобралось, либо превысило maxBodyBytes.
func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	err := json.NewDecoder(r.Body).Decode(target)
	if err == nil {
		return true
	}

	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		respondErrorCode(w, models.CodePayloadTooLarge)
		return false
	}
	respondErrorCode(w, models.CodeBadRequest)
	return false
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), healthCheckTimeout)
	defer cancel()

	status := http.StatusOK
	response := models.HealthResponse{
		Status:   "ok",
		Time:     models.FormatTime(time.Now()),
		Database: "ok",
	}
	if err := s.usecase.Health(ctx); err != nil {
		slog.Error("health check failed", "error", err.Error())
		status = http.StatusServiceUnavailable
		response.Status = "degraded"
		response.Database = "down"
	}
	respond(w, status, response)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var request models.LoginRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if err := request.Validate(); err != nil {
		respondErrorCode(w, models.CodeBadRequest)
		return
	}

	user, err := s.usecase.Login(r.Context(), request.Login)
	switch {
	case errors.Is(err, usecase.ErrUnknownLogin):
		respondErrorCode(w, models.CodeUnknownLogin)
		return
	case err != nil:
		s.fail(r, w, err)
		return
	}

	respond(w, http.StatusOK, models.LoginResponse{Login: user.Login})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var request models.LoginRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if err := request.Validate(); err != nil {
		respondErrorCode(w, models.CodeBadRequest)
		return
	}

	user, err := s.usecase.Register(r.Context(), request.Login)
	switch {
	case errors.Is(err, usecase.ErrLoginTaken):
		respondErrorCode(w, models.CodeLoginTaken)
		return
	case err != nil:
		s.fail(r, w, err)
		return
	}

	respond(w, http.StatusCreated, models.RegisterResponse{UserID: user.ID, Login: user.Login})
}

func (s *Server) handlePull(w http.ResponseWriter, r *http.Request) {
	userID, _ := sessionFrom(r.Context())

	raw := r.URL.Query().Get("since")
	if raw == "" {
		respondError(w, http.StatusBadRequest, models.CodeBadRequest, "Не указан параметр since")
		return
	}
	since, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || since < 0 {
		respondError(w, http.StatusBadRequest, models.CodeBadRequest, "Некорректный параметр since")
		return
	}

	var limit int
	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err = strconv.Atoi(raw)
		if err != nil || limit <= 0 {
			respondError(w, http.StatusBadRequest, models.CodeBadRequest, "Некорректный параметр limit")
			return
		}
	}

	output, err := s.usecase.Pull(r.Context(), userID, since, limit)
	if err != nil {
		s.fail(r, w, err)
		return
	}

	if entry := logEntryFrom(r.Context()); entry != nil {
		entry.Since = &since
		entry.NextSeq = &output.NextSeq
		count := output.Changes.Total()
		entry.Records = &count
	}
	respond(w, http.StatusOK, models.NewPullResponse(output.Changes, output.NextSeq, output.ServerSeq))
}

func (s *Server) handlePush(w http.ResponseWriter, r *http.Request) {
	userID, _ := sessionFrom(r.Context())

	var request models.PushRequest
	if !decodeJSON(w, r, &request) {
		return
	}

	input := usecase.PushInput{
		Accounts:   make([]models.Account, 0, len(request.Accounts)),
		Categories: make([]models.Category, 0, len(request.Categories)),
		Operations: make([]models.Operation, 0, len(request.Operations)),
	}

	for _, account := range request.Accounts {
		if err := account.Validate(); err != nil {
			respondError(w, http.StatusUnprocessableEntity, models.CodeSchemaError, err.Error())
			return
		}
		input.Accounts = append(input.Accounts, account.ToModel())
	}
	for _, category := range request.Categories {
		if err := category.Validate(); err != nil {
			respondError(w, http.StatusUnprocessableEntity, models.CodeSchemaError, err.Error())
			return
		}
		input.Categories = append(input.Categories, category.ToModel())
	}

	malformed := map[string]string{}
	for _, operation := range request.Operations {
		if err := operation.Validate(); err != nil {
			malformed[operation.ID] = err.Error()
			continue
		}
		input.Operations = append(input.Operations, operation.ToModel())
	}

	result, err := s.usecase.Push(r.Context(), userID, input)
	if err != nil {
		s.fail(r, w, err)
		return
	}
	for id, reason := range malformed {
		result.Rejected[id] = reason
	}

	if entry := logEntryFrom(r.Context()); entry != nil {
		accepted, rejected := len(result.Accepted), len(result.Rejected)
		entry.Accepted = &accepted
		entry.Rejected = &rejected
	}
	respond(w, http.StatusOK, models.PushResponse{
		Accepted:   result.Accepted,
		Rejected:   result.Rejected,
		FinishedAt: models.FormatTime(time.Now()),
	})
}

func (s *Server) handleExportCSV(w http.ResponseWriter, r *http.Request) {
	userID, _ := sessionFrom(r.Context())

	file, err := s.usecase.ExportCSV(r.Context(), userID)
	if err != nil {
		s.fail(r, w, err)
		return
	}

	name := "operations-" + time.Now().UTC().Format("2006-01-02") + ".csv"
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(file)
}

func (s *Server) fail(r *http.Request, w http.ResponseWriter, err error) {
	userID, _ := sessionFrom(r.Context())
	slog.ErrorContext(r.Context(), "request failed",
		"method", r.Method, "path", r.URL.Path, "user_id", userID, "error", err.Error())
	respondErrorCode(w, models.CodeInternalError)
}
