package usecase

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/olegtemek/all-cash-server/internal/models"
)

func day(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.DateOnly, value)
	require.NoError(t, err)
	return parsed
}

func TestExportCSVFormat(t *testing.T) {
	destinationAmount := money("200.00")
	repo := &repoMock{
		liveOperationsFn: func(context.Context, string) ([]models.Operation, error) {
			return []models.Operation{
				{
					ID: "op-1", Date: day(t, "2026-09-01"), CreatedAt: day(t, "2026-09-01"),
					Kind: models.KindIncome, AccountID: "acc-1", Amount: money("450000.00"),
					Currency: "KZT", CategoryID: text("cat-1"), Note: text("Аванс"),
				},
				{
					ID: "op-2", Date: day(t, "2026-09-05"), CreatedAt: day(t, "2026-09-05"),
					Kind: models.KindDebt, AccountID: "acc-1", Amount: money("50000.00"),
					Currency: "KZT", Counterparty: text("Данияр"), DebtDirection: text(models.DebtGiven),
				},
				{
					ID: "op-3", Date: day(t, "2026-09-07"), CreatedAt: day(t, "2026-09-07"),
					Kind: models.KindTransfer, AccountID: "acc-1", Amount: money("100000.00"),
					Currency: "KZT", DestinationAccountID: text("acc-2"),
					DestinationAmount: &destinationAmount, DestinationCurrency: text("USD"),
					Note: text("Покупка; валюты"),
				},
				{
					ID: "op-4", Date: day(t, "2026-09-12"), CreatedAt: day(t, "2026-09-12"),
					Kind: models.KindRepayment, AccountID: "acc-1", Amount: money("25000.00"),
					Currency: "KZT", DebtID: text("op-2"), Note: text("Первая часть"),
				},
			}, nil
		},
		accountNamesFn: func(context.Context, string) (map[string]string, error) {
			return map[string]string{"acc-1": "Kaspi Gold", "acc-2": "Freedom USD"}, nil
		},
		categoryNamesFn: func(context.Context, string) (map[string]string, error) {
			return map[string]string{"cat-1": "Зарплата"}, nil
		},
		debtCounterpartiesFn: func(context.Context, string) (map[string]string, error) {
			return map[string]string{"op-2": "Данияр"}, nil
		},
		debtDirectionsFn: func(context.Context, string) (map[string]string, error) {
			return map[string]string{"op-2": models.DebtGiven}, nil
		},
	}
	uc := newUsecase(t, repo)

	file, err := uc.ExportCSV(context.Background(), userOleg)
	require.NoError(t, err)

	content := string(file)
	require.True(t, strings.HasPrefix(content, "\uFEFF"), "файл начинается с BOM")

	lines := strings.Split(strings.TrimSuffix(strings.TrimPrefix(content, "\uFEFF"), "\r\n"), "\r\n")
	require.Equal(t, csvHeader, lines[0])
	require.Equal(t, "2026-09-01;Доход;Зарплата;;Kaspi Gold;450000,00;KZT;Аванс", lines[1])
	require.Equal(t, "2026-09-05;Дал в долг;;Данияр;Kaspi Gold;50000,00;KZT;", lines[2])
	require.Equal(t, `2026-09-07;Перевод;;;Kaspi Gold → Freedom USD;100000,00;KZT;"Покупка; валюты"`, lines[3])
	require.Equal(t, "2026-09-12;Вернули долг;;Данияр;Kaspi Gold;25000,00;KZT;Первая часть", lines[4])
}

func TestExportCSVRepaymentOfTakenDebt(t *testing.T) {
	repo := &repoMock{
		liveOperationsFn: func(context.Context, string) ([]models.Operation, error) {
			return []models.Operation{{
				ID: "op-1", Date: day(t, "2026-09-12"), CreatedAt: day(t, "2026-09-12"),
				Kind: models.KindRepayment, AccountID: "acc-1", Amount: money("1000.00"),
				Currency: "KZT", DebtID: text("op-0"),
			}}, nil
		},
		debtDirectionsFn: func(context.Context, string) (map[string]string, error) {
			return map[string]string{"op-0": models.DebtTaken}, nil
		},
	}
	uc := newUsecase(t, repo)

	file, err := uc.ExportCSV(context.Background(), userOleg)
	require.NoError(t, err)
	require.Contains(t, string(file), ";Вернул долг;")
}

func TestExportCSVEmptyHasHeaderOnly(t *testing.T) {
	repo := &repoMock{
		liveOperationsFn: func(context.Context, string) ([]models.Operation, error) { return nil, nil },
	}
	uc := newUsecase(t, repo)

	file, err := uc.ExportCSV(context.Background(), userOleg)
	require.NoError(t, err)
	require.Equal(t, "\uFEFF"+csvHeader+"\r\n", string(file))
}
