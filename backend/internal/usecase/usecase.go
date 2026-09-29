package usecase

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/shopspring/decimal"

	"github.com/olegtemek/all-cash-server/internal/models"
)

var (
	ErrUnknownLogin = errors.New("usecase: unknown login")

	ErrInvalidSession = errors.New("usecase: invalid session")

	ErrLoginTaken = errors.New("usecase: login already taken")
)

const (
	reasonAmountNotPositive = "Сумма должна быть больше нуля"
	reasonCurrencyMismatch  = "Валюта операции не совпадает с валютой счёта"
	reasonCategoryMismatch  = "Категория не подходит для этого типа операции"
	reasonRepaymentTooBig   = "Сумма погашения больше остатка долга"
	reasonSameAccounts      = "Счета перевода совпадают"
	reasonAccountNotFound   = "Счёт не найден"
	reasonDebtNotFound      = "Долг не найден"
	reasonBadDate           = "Некорректная дата операции"
	reasonTooLong           = "Слишком длинное значение"
)

var (
	minOperationDate = time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	futureTolerance  = 24 * time.Hour
)

const pullLimitCeiling = 5000

type Repository interface {
	Ping(ctx context.Context) error

	UserByLogin(ctx context.Context, login string) (models.User, error)
	CreateUser(ctx context.Context, login string) (models.User, error)

	Account(ctx context.Context, userID, id string) (models.Account, error)
	Category(ctx context.Context, userID, id string) (models.Category, error)
	Operation(ctx context.Context, userID, id string) (models.Operation, error)
	RepaymentsTotal(ctx context.Context, userID, debtID, excludeID string) (decimal.Decimal, error)

	SaveAccount(ctx context.Context, userID string, account models.Account) (int64, error)
	SaveCategory(ctx context.Context, userID string, category models.Category) (int64, error)
	SaveOperation(ctx context.Context, userID string, operation models.Operation) (int64, error)

	Changes(ctx context.Context, userID string, since int64, limit int) (models.Changes, error)

	LiveOperations(ctx context.Context, userID string) ([]models.Operation, error)
	AccountNames(ctx context.Context, userID string) (map[string]string, error)
	CategoryNames(ctx context.Context, userID string) (map[string]string, error)
	DebtCounterparties(ctx context.Context, userID string) (map[string]string, error)
	DebtDirections(ctx context.Context, userID string) (map[string]string, error)
}

type Usecase struct {
	repo      Repository
	pullLimit int
	now       func() time.Time
}

func New(repo Repository, pullLimit int) *Usecase {
	if pullLimit <= 0 {
		pullLimit = 2000
	}
	return &Usecase{repo: repo, pullLimit: pullLimit, now: func() time.Time { return time.Now().UTC() }}
}

func (u *Usecase) Health(ctx context.Context) error {
	return u.repo.Ping(ctx)
}

type PushInput struct {
	Accounts   []models.Account
	Categories []models.Category
	Operations []models.Operation
}

type PullOutput struct {
	Changes models.Changes
	NextSeq int64
}

func (u *Usecase) Login(ctx context.Context, login string) (models.User, error) {
	user, err := u.repo.UserByLogin(ctx, models.NormalizeLogin(login))
	if errors.Is(err, models.ErrNotFound) {
		return models.User{}, ErrUnknownLogin
	}
	if err != nil {
		return models.User{}, err
	}
	return user, nil
}

func (u *Usecase) Register(ctx context.Context, login string) (models.User, error) {
	normalized := models.NormalizeLogin(login)

	switch _, err := u.repo.UserByLogin(ctx, normalized); {
	case err == nil:
		return models.User{}, ErrLoginTaken
	case !errors.Is(err, models.ErrNotFound):
		return models.User{}, err
	}

	return u.repo.CreateUser(ctx, normalized)
}

func (u *Usecase) Authenticate(ctx context.Context, login string) (models.User, error) {
	normalized := models.NormalizeLogin(login)
	if normalized == "" {
		return models.User{}, ErrInvalidSession
	}
	user, err := u.repo.UserByLogin(ctx, normalized)
	if errors.Is(err, models.ErrNotFound) {
		return models.User{}, ErrInvalidSession
	}
	if err != nil {
		return models.User{}, err
	}
	return user, nil
}

func (u *Usecase) Pull(ctx context.Context, userID string, since int64, limit int) (PullOutput, error) {
	if limit <= 0 {
		limit = u.pullLimit
	}
	if limit > pullLimitCeiling {
		limit = pullLimitCeiling
	}
	if since < 0 {
		since = 0
	}

	changes, err := u.repo.Changes(ctx, userID, since, limit)
	if err != nil {
		return PullOutput{}, err
	}

	nextSeq := since
	if max := changes.MaxSeq(); max > 0 {
		nextSeq = max
	}
	return PullOutput{Changes: changes, NextSeq: nextSeq}, nil
}

func (u *Usecase) Push(ctx context.Context, userID string, input PushInput) (models.PushResult, error) {
	result := models.PushResult{
		Accepted: map[string]int64{},
		Rejected: map[string]string{},
	}

	for _, account := range input.Accounts {
		if reason := u.validateAccount(account); reason != "" {
			result.Rejected[account.ID] = reason
			continue
		}
		seq, err := u.repo.SaveAccount(ctx, userID, account)
		if err != nil {
			return models.PushResult{}, fmt.Errorf("usecase: save account %s: %w", account.ID, err)
		}
		result.Accepted[account.ID] = seq
	}

	for _, category := range input.Categories {
		if reason := u.validateCategory(category); reason != "" {
			result.Rejected[category.ID] = reason
			continue
		}
		seq, err := u.repo.SaveCategory(ctx, userID, category)
		if err != nil {
			return models.PushResult{}, fmt.Errorf("usecase: save category %s: %w", category.ID, err)
		}
		result.Accepted[category.ID] = seq
	}

	for _, operation := range sortOperations(input.Operations) {
		reason, err := u.validateOperation(ctx, userID, operation)
		if err != nil {
			return models.PushResult{}, err
		}
		if reason != "" {
			result.Rejected[operation.ID] = reason
			continue
		}
		seq, err := u.repo.SaveOperation(ctx, userID, operation)
		if err != nil {
			return models.PushResult{}, fmt.Errorf("usecase: save operation %s: %w", operation.ID, err)
		}
		result.Accepted[operation.ID] = seq
	}

	return result, nil
}

func sortOperations(operations []models.Operation) []models.Operation {
	sorted := append([]models.Operation(nil), operations...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return sorted[i].Kind == models.KindDebt && sorted[j].Kind != models.KindDebt
	})
	return sorted
}

func (u *Usecase) validateAccount(account models.Account) string {
	if account.DeletedAt != nil {
		return ""
	}
	if len([]rune(account.Name)) > models.MaxNameLen {
		return reasonTooLong
	}
	return ""
}

func (u *Usecase) validateCategory(category models.Category) string {
	if category.DeletedAt != nil {
		return ""
	}
	if len([]rune(category.Name)) > models.MaxNameLen {
		return reasonTooLong
	}
	return ""
}

func (u *Usecase) validateOperation(ctx context.Context, userID string, op models.Operation) (string, error) {
	if op.DeletedAt != nil {
		return "", nil
	}

	if reason := u.checkLengths(op); reason != "" {
		return reason, nil
	}
	if reason := u.checkDate(op); reason != "" {
		return reason, nil
	}
	if !op.Amount.IsPositive() {
		return reasonAmountNotPositive, nil
	}
	if op.DestinationAmount != nil && !op.DestinationAmount.IsPositive() {
		return reasonAmountNotPositive, nil
	}

	account, err := u.repo.Account(ctx, userID, op.AccountID)
	if errors.Is(err, models.ErrNotFound) {
		return reasonAccountNotFound, nil
	}
	if err != nil {
		return "", err
	}
	if account.Currency != op.Currency {
		return reasonCurrencyMismatch, nil
	}

	switch op.Kind {
	case models.KindExpense, models.KindIncome:
		return u.checkCategory(ctx, userID, op)
	case models.KindRepayment:
		return u.checkRepayment(ctx, userID, op)
	case models.KindTransfer:
		return u.checkTransfer(ctx, userID, op)
	}
	return "", nil
}

func (u *Usecase) checkLengths(op models.Operation) string {
	if op.Note != nil && len([]rune(*op.Note)) > models.MaxNoteLen {
		return reasonTooLong
	}
	if op.Counterparty != nil && len([]rune(*op.Counterparty)) > models.MaxCounterpartyLen {
		return reasonTooLong
	}
	return ""
}

func (u *Usecase) checkDate(op models.Operation) string {
	if op.Date.Before(minOperationDate) || op.Date.After(u.now().Add(futureTolerance)) {
		return reasonBadDate
	}
	return ""
}

func (u *Usecase) checkCategory(ctx context.Context, userID string, op models.Operation) (string, error) {
	if op.CategoryID == nil {
		return reasonCategoryMismatch, nil
	}
	category, err := u.repo.Category(ctx, userID, *op.CategoryID)
	if errors.Is(err, models.ErrNotFound) {
		return reasonCategoryMismatch, nil
	}
	if err != nil {
		return "", err
	}
	if category.Kind != op.Kind {
		return reasonCategoryMismatch, nil
	}
	return "", nil
}

func (u *Usecase) checkRepayment(ctx context.Context, userID string, op models.Operation) (string, error) {
	if op.DebtID == nil {
		return reasonDebtNotFound, nil
	}
	debt, err := u.repo.Operation(ctx, userID, *op.DebtID)
	if errors.Is(err, models.ErrNotFound) {
		return reasonDebtNotFound, nil
	}
	if err != nil {
		return "", err
	}
	if debt.Kind != models.KindDebt || debt.DeletedAt != nil {
		return reasonDebtNotFound, nil
	}
	if debt.Currency != op.Currency {
		return reasonCurrencyMismatch, nil
	}

	repaid, err := u.repo.RepaymentsTotal(ctx, userID, *op.DebtID, op.ID)
	if err != nil {
		return "", err
	}
	if repaid.Add(op.Amount).GreaterThan(debt.Amount) {
		return reasonRepaymentTooBig, nil
	}
	return "", nil
}

func (u *Usecase) checkTransfer(ctx context.Context, userID string, op models.Operation) (string, error) {
	if op.DestinationAccountID == nil || op.DestinationCurrency == nil {
		return reasonAccountNotFound, nil
	}
	if *op.DestinationAccountID == op.AccountID {
		return reasonSameAccounts, nil
	}
	destination, err := u.repo.Account(ctx, userID, *op.DestinationAccountID)
	if errors.Is(err, models.ErrNotFound) {
		return reasonAccountNotFound, nil
	}
	if err != nil {
		return "", err
	}
	if destination.Currency != *op.DestinationCurrency {
		return reasonCurrencyMismatch, nil
	}
	return "", nil
}
