package models

import (
	"net/http"
	"time"

	"github.com/shopspring/decimal"
)

const TimeLayout = "2006-01-02T15:04:05.000Z"

type ErrorCode string

const (
	CodeBadRequest      ErrorCode = "bad_request"
	CodeUnknownLogin    ErrorCode = "unknown_login"
	CodeInvalidToken    ErrorCode = "invalid_token"
	CodePayloadTooLarge ErrorCode = "payload_too_large"
	CodeSchemaError     ErrorCode = "schema_error"
	CodeLoginTaken      ErrorCode = "login_taken"
	CodeInternalError   ErrorCode = "internal_error"
)

type errorSpec struct {
	Status  int
	Message string
}

var errorSpecs = map[ErrorCode]errorSpec{
	CodeBadRequest:      {http.StatusBadRequest, "Некорректный запрос"},
	CodeUnknownLogin:    {http.StatusUnauthorized, "Неизвестный логин"},
	CodeInvalidToken:    {http.StatusUnauthorized, "Сессия недействительна"},
	CodePayloadTooLarge: {http.StatusRequestEntityTooLarge, "Слишком большой запрос"},
	CodeSchemaError:     {http.StatusUnprocessableEntity, "Нарушена схема справочников"},
	CodeLoginTaken:      {http.StatusConflict, "Логин уже занят"},
	CodeInternalError:   {http.StatusInternalServerError, "Внутренняя ошибка сервера"},
}

func ErrorStatus(code ErrorCode) (int, string) {
	if spec, ok := errorSpecs[code]; ok {
		return spec.Status, spec.Message
	}
	return http.StatusInternalServerError, errorSpecs[CodeInternalError].Message
}

type HealthResponse struct {
	Status   string `json:"status"`
	Time     string `json:"time"`
	Database string `json:"database"`
}

type LoginResponse struct {
	Login string `json:"login"`
}

type RegisterResponse struct {
	UserID string `json:"userId"`
	Login  string `json:"login"`
}

type AccountResponse struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Currency       string  `json:"currency"`
	InitialBalance string  `json:"initialBalance"`
	IsArchived     bool    `json:"isArchived"`
	IsHidden       bool    `json:"isHidden"`
	DeletedAt      *string `json:"deletedAt"`
	Seq            int64   `json:"seq"`
}

type CategoryResponse struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Kind       string  `json:"kind"`
	SymbolName string  `json:"symbolName"`
	Color      string  `json:"color"`
	DeletedAt  *string `json:"deletedAt"`
	Seq        int64   `json:"seq"`
}

type OperationResponse struct {
	ID                   string  `json:"id"`
	Date                 string  `json:"date"`
	CreatedAt            string  `json:"createdAt"`
	Note                 *string `json:"note"`
	Kind                 string  `json:"kind"`
	AccountID            string  `json:"accountId"`
	Amount               string  `json:"amount"`
	Currency             string  `json:"currency"`
	CategoryID           *string `json:"categoryId"`
	Counterparty         *string `json:"counterparty"`
	DebtDirection        *string `json:"debtDirection"`
	DebtID               *string `json:"debtId"`
	DestinationAccountID *string `json:"destinationAccountId"`
	DestinationAmount    *string `json:"destinationAmount"`
	DestinationCurrency  *string `json:"destinationCurrency"`
	DeletedAt            *string `json:"deletedAt"`
	Seq                  int64   `json:"seq"`
}

type PullResponse struct {
	NextSeq    int64               `json:"nextSeq"`
	HasMore    bool                `json:"hasMore"`
	Accounts   []AccountResponse   `json:"accounts"`
	Categories []CategoryResponse  `json:"categories"`
	Operations []OperationResponse `json:"operations"`
}

type PushResponse struct {
	Accepted   map[string]int64  `json:"accepted"`
	Rejected   map[string]string `json:"rejected"`
	FinishedAt string            `json:"finishedAt"`
}

func NewPullResponse(changes Changes, nextSeq int64) PullResponse {
	response := PullResponse{
		NextSeq:    nextSeq,
		HasMore:    changes.HasMore,
		Accounts:   make([]AccountResponse, 0, len(changes.Accounts)),
		Categories: make([]CategoryResponse, 0, len(changes.Categories)),
		Operations: make([]OperationResponse, 0, len(changes.Operations)),
	}
	for _, account := range changes.Accounts {
		response.Accounts = append(response.Accounts, AccountResponse{
			ID:             account.ID,
			Name:           account.Name,
			Currency:       account.Currency,
			InitialBalance: account.InitialBalance.StringFixed(2),
			IsArchived:     account.IsArchived,
			IsHidden:       account.IsHidden,
			DeletedAt:      FormatOptionalTime(account.DeletedAt),
			Seq:            account.Seq,
		})
	}
	for _, category := range changes.Categories {
		response.Categories = append(response.Categories, CategoryResponse{
			ID:         category.ID,
			Name:       category.Name,
			Kind:       category.Kind,
			SymbolName: category.SymbolName,
			Color:      category.Color,
			DeletedAt:  FormatOptionalTime(category.DeletedAt),
			Seq:        category.Seq,
		})
	}
	for _, operation := range changes.Operations {
		response.Operations = append(response.Operations, OperationResponse{
			ID:                   operation.ID,
			Date:                 FormatTime(operation.Date),
			CreatedAt:            FormatTime(operation.CreatedAt),
			Note:                 operation.Note,
			Kind:                 operation.Kind,
			AccountID:            operation.AccountID,
			Amount:               operation.Amount.StringFixed(2),
			Currency:             operation.Currency,
			CategoryID:           operation.CategoryID,
			Counterparty:         operation.Counterparty,
			DebtDirection:        operation.DebtDirection,
			DebtID:               operation.DebtID,
			DestinationAccountID: operation.DestinationAccountID,
			DestinationAmount:    formatOptionalAmount(operation.DestinationAmount),
			DestinationCurrency:  operation.DestinationCurrency,
			DeletedAt:            FormatOptionalTime(operation.DeletedAt),
			Seq:                  operation.Seq,
		})
	}
	return response
}

func FormatTime(value time.Time) string {
	return value.UTC().Format(TimeLayout)
}

func FormatOptionalTime(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := FormatTime(*value)
	return &formatted
}

func formatOptionalAmount(value *decimal.Decimal) *string {
	if value == nil {
		return nil
	}
	formatted := value.StringFixed(2)
	return &formatted
}
