package usecase

import (
	"context"
	"testing"

	"github.com/shopspring/decimal"

	"github.com/olegtemek/all-cash-server/internal/models"
)

type repoMock struct {
	t *testing.T

	pingFn func(ctx context.Context) error

	userByLoginFn func(ctx context.Context, login string) (models.User, error)
	createUserFn  func(ctx context.Context, login string) (models.User, error)

	accountFn         func(ctx context.Context, userID, id string) (models.Account, error)
	categoryFn        func(ctx context.Context, userID, id string) (models.Category, error)
	operationFn       func(ctx context.Context, userID, id string) (models.Operation, error)
	repaymentsTotalFn func(ctx context.Context, userID, debtID, excludeID string) (decimal.Decimal, error)

	saveAccountFn   func(ctx context.Context, userID string, account models.Account) (int64, error)
	saveCategoryFn  func(ctx context.Context, userID string, category models.Category) (int64, error)
	saveOperationFn func(ctx context.Context, userID string, operation models.Operation) (int64, error)

	maxSeqFn  func(ctx context.Context, userID string) (int64, error)
	changesFn func(ctx context.Context, userID string, since int64, limit int) (models.Changes, error)

	liveOperationsFn     func(ctx context.Context, userID string) ([]models.Operation, error)
	accountNamesFn       func(ctx context.Context, userID string) (map[string]string, error)
	categoryNamesFn      func(ctx context.Context, userID string) (map[string]string, error)
	debtCounterpartiesFn func(ctx context.Context, userID string) (map[string]string, error)
	debtDirectionsFn     func(ctx context.Context, userID string) (map[string]string, error)
}

func (m *repoMock) unexpected(method string) {
	m.t.Helper()
	m.t.Fatalf("неожиданный вызов метода repository.%s", method)
}

func (m *repoMock) Ping(ctx context.Context) error {
	if m.pingFn == nil {
		m.unexpected("Ping")
	}
	return m.pingFn(ctx)
}

func (m *repoMock) UserByLogin(ctx context.Context, login string) (models.User, error) {
	if m.userByLoginFn == nil {
		m.unexpected("UserByLogin")
	}
	return m.userByLoginFn(ctx, login)
}

func (m *repoMock) CreateUser(ctx context.Context, login string) (models.User, error) {
	if m.createUserFn == nil {
		m.unexpected("CreateUser")
	}
	return m.createUserFn(ctx, login)
}

func (m *repoMock) Account(ctx context.Context, userID, id string) (models.Account, error) {
	if m.accountFn == nil {
		m.unexpected("Account")
	}
	return m.accountFn(ctx, userID, id)
}

func (m *repoMock) Category(ctx context.Context, userID, id string) (models.Category, error) {
	if m.categoryFn == nil {
		m.unexpected("Category")
	}
	return m.categoryFn(ctx, userID, id)
}

func (m *repoMock) Operation(ctx context.Context, userID, id string) (models.Operation, error) {
	if m.operationFn == nil {
		m.unexpected("Operation")
	}
	return m.operationFn(ctx, userID, id)
}

func (m *repoMock) RepaymentsTotal(ctx context.Context, userID, debtID, excludeID string) (decimal.Decimal, error) {
	if m.repaymentsTotalFn == nil {
		m.unexpected("RepaymentsTotal")
	}
	return m.repaymentsTotalFn(ctx, userID, debtID, excludeID)
}

func (m *repoMock) SaveAccount(ctx context.Context, userID string, account models.Account) (int64, error) {
	if m.saveAccountFn == nil {
		m.unexpected("SaveAccount")
	}
	return m.saveAccountFn(ctx, userID, account)
}

func (m *repoMock) SaveCategory(ctx context.Context, userID string, category models.Category) (int64, error) {
	if m.saveCategoryFn == nil {
		m.unexpected("SaveCategory")
	}
	return m.saveCategoryFn(ctx, userID, category)
}

func (m *repoMock) SaveOperation(ctx context.Context, userID string, operation models.Operation) (int64, error) {
	if m.saveOperationFn == nil {
		m.unexpected("SaveOperation")
	}
	return m.saveOperationFn(ctx, userID, operation)
}

func (m *repoMock) Changes(ctx context.Context, userID string, since int64, limit int) (models.Changes, error) {
	if m.changesFn == nil {
		m.unexpected("Changes")
	}
	return m.changesFn(ctx, userID, since, limit)
}

func (m *repoMock) MaxSeq(ctx context.Context, userID string) (int64, error) {
	if m.maxSeqFn == nil {
		m.unexpected("MaxSeq")
	}
	return m.maxSeqFn(ctx, userID)
}

func (m *repoMock) LiveOperations(ctx context.Context, userID string) ([]models.Operation, error) {
	if m.liveOperationsFn == nil {
		m.unexpected("LiveOperations")
	}
	return m.liveOperationsFn(ctx, userID)
}

func (m *repoMock) AccountNames(ctx context.Context, userID string) (map[string]string, error) {
	if m.accountNamesFn == nil {
		return map[string]string{}, nil
	}
	return m.accountNamesFn(ctx, userID)
}

func (m *repoMock) CategoryNames(ctx context.Context, userID string) (map[string]string, error) {
	if m.categoryNamesFn == nil {
		return map[string]string{}, nil
	}
	return m.categoryNamesFn(ctx, userID)
}

func (m *repoMock) DebtCounterparties(ctx context.Context, userID string) (map[string]string, error) {
	if m.debtCounterpartiesFn == nil {
		return map[string]string{}, nil
	}
	return m.debtCounterpartiesFn(ctx, userID)
}

func (m *repoMock) DebtDirections(ctx context.Context, userID string) (map[string]string, error) {
	if m.debtDirectionsFn == nil {
		return map[string]string{}, nil
	}
	return m.debtDirectionsFn(ctx, userID)
}
