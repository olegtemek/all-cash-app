package models

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type LoginRequest struct {
	Login string `json:"login"`
}

func (r LoginRequest) Validate() error {
	if len([]rune(NormalizeLogin(r.Login))) < 3 {
		return errors.New("логин короче трёх символов")
	}
	return nil
}

func NormalizeLogin(login string) string {
	return strings.ToLower(strings.TrimSpace(login))
}

type PushRequest struct {
	Accounts   []AccountRequest   `json:"accounts"`
	Categories []CategoryRequest  `json:"categories"`
	Operations []OperationRequest `json:"operations"`
}

type AccountRequest struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	Currency       string  `json:"currency"`
	InitialBalance string  `json:"initialBalance"`
	IsArchived     bool    `json:"isArchived"`
	IsHidden       bool    `json:"isHidden"`
	DeletedAt      *string `json:"deletedAt"`
}

func (r AccountRequest) Validate() error {
	if !isUUID(r.ID) {
		return errors.New("некорректный идентификатор счёта")
	}
	if strings.TrimSpace(r.Name) == "" {
		return errors.New("название счёта пустое")
	}
	if !Currencies[r.Currency] {
		return fmt.Errorf("неизвестная валюта %q", r.Currency)
	}
	if _, err := decimal.NewFromString(r.InitialBalance); err != nil {
		return errors.New("некорректный начальный остаток")
	}
	if _, err := parseOptionalTime(r.DeletedAt); err != nil {
		return errors.New("некорректная дата удаления счёта")
	}
	return nil
}

func (r AccountRequest) ToModel() Account {
	balance, _ := decimal.NewFromString(r.InitialBalance)
	deletedAt, _ := parseOptionalTime(r.DeletedAt)
	return Account{
		ID:             r.ID,
		Name:           r.Name,
		Currency:       r.Currency,
		InitialBalance: balance,
		IsArchived:     r.IsArchived,
		IsHidden:       r.IsHidden,
		DeletedAt:      deletedAt,
	}
}

type CategoryRequest struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Kind       string  `json:"kind"`
	SymbolName string  `json:"symbolName"`
	Color      string  `json:"color"`
	DeletedAt  *string `json:"deletedAt"`
}

func (r CategoryRequest) Validate() error {
	if !isUUID(r.ID) {
		return errors.New("некорректный идентификатор категории")
	}
	if strings.TrimSpace(r.Name) == "" {
		return errors.New("название категории пустое")
	}
	if r.Kind != CategoryExpense && r.Kind != CategoryIncome {
		return fmt.Errorf("неизвестный вид категории %q", r.Kind)
	}
	if strings.TrimSpace(r.SymbolName) == "" {
		return errors.New("имя символа категории пустое")
	}
	if !Colors[r.Color] {
		return fmt.Errorf("неизвестный цвет %q", r.Color)
	}
	if _, err := parseOptionalTime(r.DeletedAt); err != nil {
		return errors.New("некорректная дата удаления категории")
	}
	return nil
}

func (r CategoryRequest) ToModel() Category {
	deletedAt, _ := parseOptionalTime(r.DeletedAt)
	return Category{
		ID:         r.ID,
		Name:       r.Name,
		Kind:       r.Kind,
		SymbolName: r.SymbolName,
		Color:      r.Color,
		DeletedAt:  deletedAt,
	}
}

type OperationRequest struct {
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
}

func (r OperationRequest) Validate() error {
	if !isUUID(r.ID) {
		return errors.New("Некорректный идентификатор операции")
	}
	if !Kinds[r.Kind] {
		return errors.New("Неизвестный тип операции")
	}
	if _, err := time.Parse(time.RFC3339, r.Date); err != nil {
		return errors.New("Некорректная дата операции")
	}
	if _, err := time.Parse(time.RFC3339, r.CreatedAt); err != nil {
		return errors.New("Некорректное время создания")
	}
	if _, err := parseOptionalTime(r.DeletedAt); err != nil {
		return errors.New("Некорректная дата удаления")
	}
	if !isUUID(r.AccountID) {
		return errors.New("Некорректный идентификатор счёта")
	}
	if _, err := decimal.NewFromString(r.Amount); err != nil {
		return errors.New("Некорректная сумма")
	}
	if !Currencies[r.Currency] {
		return errors.New("Неизвестная валюта")
	}

	required, err := r.requiredFields()
	if err != nil {
		return err
	}
	return r.checkFieldSet(required)
}

func (r OperationRequest) requiredFields() (map[string]bool, error) {
	switch r.Kind {
	case KindExpense, KindIncome:
		if !optionalUUIDSet(r.CategoryID) {
			return nil, errors.New("Некорректный идентификатор категории")
		}
		return map[string]bool{"categoryId": true}, nil

	case KindDebt:
		if r.Counterparty == nil || strings.TrimSpace(*r.Counterparty) == "" {
			return nil, errors.New("Контрагент не указан")
		}
		if r.DebtDirection == nil || !DebtDirections[*r.DebtDirection] {
			return nil, errors.New("Некорректное направление долга")
		}
		return map[string]bool{"counterparty": true, "debtDirection": true}, nil

	case KindRepayment:
		if !optionalUUIDSet(r.DebtID) {
			return nil, errors.New("Некорректный идентификатор долга")
		}
		return map[string]bool{"debtId": true}, nil

	case KindTransfer:
		if !optionalUUIDSet(r.DestinationAccountID) {
			return nil, errors.New("Некорректный идентификатор счёта зачисления")
		}
		if r.DestinationAmount == nil {
			return nil, errors.New("Сумма зачисления не указана")
		}
		if _, err := decimal.NewFromString(*r.DestinationAmount); err != nil {
			return nil, errors.New("Некорректная сумма зачисления")
		}
		if r.DestinationCurrency == nil || !Currencies[*r.DestinationCurrency] {
			return nil, errors.New("Неизвестная валюта зачисления")
		}
		return map[string]bool{
			"destinationAccountId": true,
			"destinationAmount":    true,
			"destinationCurrency":  true,
		}, nil
	}
	return nil, errors.New("Неизвестный тип операции")
}

func (r OperationRequest) checkFieldSet(required map[string]bool) error {
	filled := map[string]bool{
		"categoryId":           r.CategoryID != nil,
		"counterparty":         r.Counterparty != nil,
		"debtDirection":        r.DebtDirection != nil,
		"debtId":               r.DebtID != nil,
		"destinationAccountId": r.DestinationAccountID != nil,
		"destinationAmount":    r.DestinationAmount != nil,
		"destinationCurrency":  r.DestinationCurrency != nil,
	}
	for field, isFilled := range filled {
		if isFilled && !required[field] {
			return fmt.Errorf("Поле %s недопустимо для этого типа операции", field)
		}
	}
	return nil
}

func (r OperationRequest) ToModel() Operation {
	amount, _ := decimal.NewFromString(r.Amount)
	date, _ := time.Parse(time.RFC3339, r.Date)
	createdAt, _ := time.Parse(time.RFC3339, r.CreatedAt)
	deletedAt, _ := parseOptionalTime(r.DeletedAt)

	op := Operation{
		ID:                   r.ID,
		Date:                 date.UTC(),
		CreatedAt:            createdAt.UTC(),
		Note:                 r.Note,
		Kind:                 r.Kind,
		AccountID:            r.AccountID,
		Amount:               amount,
		Currency:             r.Currency,
		CategoryID:           r.CategoryID,
		Counterparty:         r.Counterparty,
		DebtDirection:        r.DebtDirection,
		DebtID:               r.DebtID,
		DestinationAccountID: r.DestinationAccountID,
		DestinationCurrency:  r.DestinationCurrency,
		DeletedAt:            deletedAt,
	}
	if r.DestinationAmount != nil {
		destination, _ := decimal.NewFromString(*r.DestinationAmount)
		op.DestinationAmount = &destination
	}
	return op
}

// isUUID reports whether value is a UUID in canonical lowercase hyphenated form.
func isUUID(value string) bool {
	parsed, err := uuid.Parse(value)
	return err == nil && parsed.String() == value
}

func optionalUUIDSet(value *string) bool {
	return value != nil && isUUID(*value)
}

func parseOptionalTime(value *string) (*time.Time, error) {
	if value == nil {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, *value)
	if err != nil {
		return nil, err
	}
	utc := parsed.UTC()
	return &utc, nil
}
