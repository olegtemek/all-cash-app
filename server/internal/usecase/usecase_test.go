package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"github.com/olegtemek/all-cash-server/internal/models"
)

const (
	userOleg  = "user-oleg"
	accountID = "8f14e45f-ea4f-4b1a-9c2d-1a2b3c4d5e6f"
	otherID   = "7a14e45f-ea4f-4b1a-9c2d-1a2b3c4d5e6f"
	catID     = "3c6e0b8a-9c15-4e0f-8b2a-7d9e1f2a3b4c"
	opID      = "1b645389-2473-4a46-9c11-0d1e2f3a4b5c"
	debtID    = "2b645389-2473-4a46-9c11-0d1e2f3a4b5c"
)

func newUsecase(t *testing.T, repo *repoMock) *Usecase {
	t.Helper()
	repo.t = t
	return New(repo, 2000)
}

func money(value string) decimal.Decimal {
	return decimal.RequireFromString(value)
}

func text(value string) *string { return &value }

func kztAccount(id string) models.Account {
	return models.Account{ID: id, Name: "Kaspi Gold", Currency: "KZT", InitialBalance: decimal.Zero}
}

func expense(id string) models.Operation {
	return models.Operation{
		ID:         id,
		Date:       time.Now().UTC().Add(-time.Hour),
		CreatedAt:  time.Now().UTC().Add(-time.Hour),
		Kind:       models.KindExpense,
		AccountID:  accountID,
		Amount:     money("12500.00"),
		Currency:   "KZT",
		CategoryID: text(catID),
	}
}

func TestPullPassesUserFromSession(t *testing.T) {
	var seenUser string
	repo := &repoMock{
		maxSeqFn: func(context.Context, string) (int64, error) { return 0, nil },
		changesFn: func(_ context.Context, userID string, _ int64, _ int) (models.Changes, error) {
			seenUser = userID
			return models.Changes{}, nil
		},
	}
	uc := newUsecase(t, repo)

	_, err := uc.Pull(context.Background(), "user-anna", 0, 0)
	require.NoError(t, err)
	require.Equal(t, "user-anna", seenUser)
}

func TestPullEmptyKeepsCursor(t *testing.T) {
	repo := &repoMock{
		maxSeqFn: func(context.Context, string) (int64, error) { return 0, nil },
		changesFn: func(context.Context, string, int64, int) (models.Changes, error) {
			return models.Changes{}, nil
		},
	}
	uc := newUsecase(t, repo)

	output, err := uc.Pull(context.Background(), userOleg, 130, 0)
	require.NoError(t, err)
	require.Equal(t, int64(130), output.NextSeq)
	require.False(t, output.Changes.HasMore)
}

func TestPullNextSeqIsMaxOfPage(t *testing.T) {
	repo := &repoMock{
		maxSeqFn: func(context.Context, string) (int64, error) { return 0, nil },
		changesFn: func(context.Context, string, int64, int) (models.Changes, error) {
			return models.Changes{
				Accounts:   []models.Account{{ID: accountID, Seq: 124}},
				Operations: []models.Operation{{ID: opID, Seq: 130}},
				HasMore:    true,
			}, nil
		},
	}
	uc := newUsecase(t, repo)

	output, err := uc.Pull(context.Background(), userOleg, 123, 0)
	require.NoError(t, err)
	require.Equal(t, int64(130), output.NextSeq)
	require.True(t, output.Changes.HasMore)
}

func TestPullLimitClampedToCeiling(t *testing.T) {
	var seenLimit int
	repo := &repoMock{
		maxSeqFn: func(context.Context, string) (int64, error) { return 0, nil },
		changesFn: func(_ context.Context, _ string, _ int64, limit int) (models.Changes, error) {
			seenLimit = limit
			return models.Changes{}, nil
		},
	}
	uc := newUsecase(t, repo)

	_, err := uc.Pull(context.Background(), userOleg, 0, 100000)
	require.NoError(t, err)
	require.Equal(t, pullLimitCeiling, seenLimit)

	_, err = uc.Pull(context.Background(), userOleg, 0, 0)
	require.NoError(t, err)
	require.Equal(t, 2000, seenLimit)
}

func TestPullReturnsServerSeq(t *testing.T) {
	repo := &repoMock{
		changesFn: func(context.Context, string, int64, int) (models.Changes, error) {
			return models.Changes{}, nil
		},
		maxSeqFn: func(_ context.Context, userID string) (int64, error) {
			require.Equal(t, userOleg, userID)
			return 42, nil
		},
	}
	uc := newUsecase(t, repo)

	output, err := uc.Pull(context.Background(), userOleg, 100, 0)
	require.NoError(t, err)
	require.Equal(t, int64(42), output.ServerSeq)
	require.Equal(t, int64(100), output.NextSeq)
}

func pushRepo(seq *int64) *repoMock {
	return &repoMock{
		accountFn: func(_ context.Context, _, id string) (models.Account, error) {
			if id == accountID || id == otherID {
				account := kztAccount(id)
				if id == otherID {
					account.Currency = "USD"
				}
				return account, nil
			}
			return models.Account{}, models.ErrNotFound
		},
		categoryFn: func(_ context.Context, _, id string) (models.Category, error) {
			if id == catID {
				return models.Category{ID: catID, Name: "Продукты", Kind: models.KindExpense}, nil
			}
			return models.Category{}, models.ErrNotFound
		},
		saveAccountFn: func(context.Context, string, models.Account) (int64, error) {
			*seq++
			return *seq, nil
		},
		saveCategoryFn: func(context.Context, string, models.Category) (int64, error) {
			*seq++
			return *seq, nil
		},
		saveOperationFn: func(context.Context, string, models.Operation) (int64, error) {
			*seq++
			return *seq, nil
		},
	}
}

func TestPushPartialRejection(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	uc := newUsecase(t, repo)

	bad := expense("4b645389-2473-4a46-9c11-0d1e2f3a4b5c")
	bad.Amount = decimal.Zero

	result, err := uc.Push(context.Background(), userOleg, PushInput{
		Operations: []models.Operation{expense(opID), bad},
	})
	require.NoError(t, err)
	require.Contains(t, result.Accepted, opID)
	require.Equal(t, reasonAmountNotPositive, result.Rejected[bad.ID])
}

func TestPushAssignsSequentialSeqAcrossTypes(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	uc := newUsecase(t, repo)

	result, err := uc.Push(context.Background(), userOleg, PushInput{
		Accounts:   []models.Account{kztAccount(accountID)},
		Categories: []models.Category{{ID: catID, Name: "Продукты", Kind: models.KindExpense}},
		Operations: []models.Operation{expense(opID)},
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), result.Accepted[accountID])
	require.Equal(t, int64(2), result.Accepted[catID])
	require.Equal(t, int64(3), result.Accepted[opID])
	require.Empty(t, result.Rejected)
}

func TestPushDebtBeforeRepayment(t *testing.T) {
	var seq int64
	var order []string
	repo := pushRepo(&seq)
	repo.saveOperationFn = func(_ context.Context, _ string, op models.Operation) (int64, error) {
		order = append(order, op.Kind)
		seq++
		return seq, nil
	}
	repo.operationFn = func(_ context.Context, _, id string) (models.Operation, error) {
		if id == debtID {
			return models.Operation{
				ID: debtID, Kind: models.KindDebt, Currency: "KZT", Amount: money("50000.00"),
			}, nil
		}
		return models.Operation{}, models.ErrNotFound
	}
	repo.repaymentsTotalFn = func(context.Context, string, string, string) (decimal.Decimal, error) {
		return decimal.Zero, nil
	}
	uc := newUsecase(t, repo)

	repayment := expense(opID)
	repayment.Kind = models.KindRepayment
	repayment.CategoryID = nil
	repayment.DebtID = text(debtID)

	debt := expense(debtID)
	debt.Kind = models.KindDebt
	debt.CategoryID = nil
	debt.Counterparty = text("Данияр")
	debt.DebtDirection = text(models.DebtGiven)
	debt.Amount = money("50000.00")

	result, err := uc.Push(context.Background(), userOleg, PushInput{
		Operations: []models.Operation{repayment, debt},
	})
	require.NoError(t, err)
	require.Equal(t, []string{models.KindDebt, models.KindRepayment}, order)
	require.Len(t, result.Accepted, 2)
}

func TestPushRepaymentOverDebt(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	repo.operationFn = func(context.Context, string, string) (models.Operation, error) {
		return models.Operation{ID: debtID, Kind: models.KindDebt, Currency: "KZT", Amount: money("50000.00")}, nil
	}
	repo.repaymentsTotalFn = func(context.Context, string, string, string) (decimal.Decimal, error) {
		return money("40000.00"), nil
	}
	uc := newUsecase(t, repo)

	repayment := expense(opID)
	repayment.Kind = models.KindRepayment
	repayment.CategoryID = nil
	repayment.DebtID = text(debtID)
	repayment.Amount = money("20000.00")

	result, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{repayment}})
	require.NoError(t, err)
	require.Equal(t, reasonRepaymentTooBig, result.Rejected[opID])
}

func TestPushRepaymentExcludesItselfFromTotal(t *testing.T) {
	var seq int64
	var seenExclude string
	repo := pushRepo(&seq)
	repo.operationFn = func(context.Context, string, string) (models.Operation, error) {
		return models.Operation{ID: debtID, Kind: models.KindDebt, Currency: "KZT", Amount: money("50000.00")}, nil
	}
	repo.repaymentsTotalFn = func(_ context.Context, _, _, excludeID string) (decimal.Decimal, error) {
		seenExclude = excludeID
		return decimal.Zero, nil
	}
	uc := newUsecase(t, repo)

	repayment := expense(opID)
	repayment.Kind = models.KindRepayment
	repayment.CategoryID = nil
	repayment.DebtID = text(debtID)

	result, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{repayment}})
	require.NoError(t, err)
	require.Equal(t, opID, seenExclude)
	require.Contains(t, result.Accepted, opID)
}

func TestPushLiveRepaymentWithUnknownDebt(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	repo.operationFn = func(context.Context, string, string) (models.Operation, error) {
		return models.Operation{}, models.ErrNotFound
	}
	uc := newUsecase(t, repo)

	repayment := expense(opID)
	repayment.Kind = models.KindRepayment
	repayment.CategoryID = nil
	repayment.DebtID = text(debtID)

	result, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{repayment}})
	require.NoError(t, err)
	require.Equal(t, reasonDebtNotFound, result.Rejected[opID])
}

func TestPushCurrencyMismatch(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	uc := newUsecase(t, repo)

	op := expense(opID)
	op.Currency = "USD"

	result, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{op}})
	require.NoError(t, err)
	require.Equal(t, reasonCurrencyMismatch, result.Rejected[opID])
}

func TestPushUnknownAccount(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	uc := newUsecase(t, repo)

	op := expense(opID)
	op.AccountID = "9c645389-2473-4a46-9c11-0d1e2f3a4b5c"

	result, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{op}})
	require.NoError(t, err)
	require.Equal(t, reasonAccountNotFound, result.Rejected[opID])
}

func TestPushExpenseAndIncomeAreSeparateCategories(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	incomeCat := "4c6e0b8a-9c15-4e0f-8b2a-7d9e1f2a3b4c"
	repo.categoryFn = func(_ context.Context, _, id string) (models.Category, error) {
		switch id {
		case catID:
			return models.Category{ID: catID, Name: "Продукты", Kind: models.KindExpense}, nil
		case incomeCat:
			return models.Category{ID: incomeCat, Name: "Зарплата", Kind: models.KindIncome}, nil
		}
		return models.Category{}, models.ErrNotFound
	}
	uc := newUsecase(t, repo)

	income := expense("7b645389-2473-4a46-9c11-0d1e2f3a4b5c")
	income.Kind = models.KindIncome
	income.CategoryID = text(incomeCat)

	result, err := uc.Push(context.Background(), userOleg, PushInput{
		Operations: []models.Operation{expense(opID), income},
	})
	require.NoError(t, err)
	require.Len(t, result.Accepted, 2)
	require.Empty(t, result.Rejected)
}

func TestPushCategoryOfWrongKind(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	uc := newUsecase(t, repo)

	op := expense(opID)
	op.Kind = models.KindIncome

	result, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{op}})
	require.NoError(t, err)
	require.Equal(t, reasonCategoryMismatch, result.Rejected[opID])
}

func TestPushTransferBetweenDifferentCurrencies(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	uc := newUsecase(t, repo)

	destinationAmount := money("200.00")
	transfer := expense(opID)
	transfer.Kind = models.KindTransfer
	transfer.CategoryID = nil
	transfer.Amount = money("100000.00")
	transfer.DestinationAccountID = text(otherID)
	transfer.DestinationAmount = &destinationAmount
	transfer.DestinationCurrency = text("USD")

	result, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{transfer}})
	require.NoError(t, err)
	require.Contains(t, result.Accepted, opID)
}

func TestPushTransferToSameAccount(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	uc := newUsecase(t, repo)

	destinationAmount := money("100.00")
	transfer := expense(opID)
	transfer.Kind = models.KindTransfer
	transfer.CategoryID = nil
	transfer.DestinationAccountID = text(accountID)
	transfer.DestinationAmount = &destinationAmount
	transfer.DestinationCurrency = text("KZT")

	result, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{transfer}})
	require.NoError(t, err)
	require.Equal(t, reasonSameAccounts, result.Rejected[opID])
}

func TestPushRejectsLongNote(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	uc := newUsecase(t, repo)

	long := expense("5b645389-2473-4a46-9c11-0d1e2f3a4b5c")
	note := make([]rune, models.MaxNoteLen+1)
	for i := range note {
		note[i] = 'я'
	}
	long.Note = text(string(note))

	result, err := uc.Push(context.Background(), userOleg, PushInput{
		Operations: []models.Operation{expense(opID), long},
	})
	require.NoError(t, err)
	require.Contains(t, result.Accepted, opID)
	require.Equal(t, reasonTooLong, result.Rejected[long.ID])
}

func TestPushRejectsFutureDate(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)
	uc := newUsecase(t, repo)

	op := expense(opID)
	op.Date = time.Now().UTC().Add(48 * time.Hour)

	result, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{op}})
	require.NoError(t, err)
	require.Equal(t, reasonBadDate, result.Rejected[opID])
}

func TestPushDeletedRecordsSkipDomainRules(t *testing.T) {
	var seq int64
	repo := pushRepo(&seq)

	repo.accountFn = nil
	repo.operationFn = nil
	repo.categoryFn = nil
	uc := newUsecase(t, repo)

	deletedAt := time.Now().UTC()

	repayment := expense(opID)
	repayment.Kind = models.KindRepayment
	repayment.CategoryID = nil
	repayment.DebtID = text(debtID)
	repayment.DeletedAt = &deletedAt

	orphan := expense("6b645389-2473-4a46-9c11-0d1e2f3a4b5c")
	orphan.AccountID = "9c645389-2473-4a46-9c11-0d1e2f3a4b5c"
	orphan.DeletedAt = &deletedAt

	account := kztAccount(accountID)
	account.DeletedAt = &deletedAt

	result, err := uc.Push(context.Background(), userOleg, PushInput{
		Accounts:   []models.Account{account},
		Operations: []models.Operation{repayment, orphan},
	})
	require.NoError(t, err)
	require.Empty(t, result.Rejected)
	require.Len(t, result.Accepted, 3)
}

func TestPushReturnsRepositoryError(t *testing.T) {
	var seq int64
	storageErr := errors.New("database is down")
	repo := pushRepo(&seq)
	repo.saveOperationFn = func(context.Context, string, models.Operation) (int64, error) {
		return 0, storageErr
	}
	uc := newUsecase(t, repo)

	_, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{expense(opID)}})
	require.ErrorIs(t, err, storageErr)
}

func TestPushRepeatDoesNotDuplicate(t *testing.T) {
	var seq int64
	saved := map[string]int{}
	repo := pushRepo(&seq)
	repo.saveOperationFn = func(_ context.Context, _ string, op models.Operation) (int64, error) {
		saved[op.ID]++
		seq++
		return seq, nil
	}
	uc := newUsecase(t, repo)

	first, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{expense(opID)}})
	require.NoError(t, err)
	second, err := uc.Push(context.Background(), userOleg, PushInput{Operations: []models.Operation{expense(opID)}})
	require.NoError(t, err)

	require.Equal(t, 2, saved[opID], "обе записи идут в тот же id через upsert")
	require.Greater(t, second.Accepted[opID], first.Accepted[opID], "повтор получает новый seq")
}
