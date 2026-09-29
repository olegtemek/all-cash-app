package usecase

import (
	"bytes"
	"context"
	"strings"

	"github.com/shopspring/decimal"

	"github.com/olegtemek/all-cash-server/internal/models"
)

const csvHeader = "Дата;Тип;Категория;Контрагент;Счёт;Сумма;Валюта;Описание"

const csvBOM = "\uFEFF"

func (u *Usecase) ExportCSV(ctx context.Context, userID string) ([]byte, error) {
	operations, err := u.repo.LiveOperations(ctx, userID)
	if err != nil {
		return nil, err
	}
	accounts, err := u.repo.AccountNames(ctx, userID)
	if err != nil {
		return nil, err
	}
	categories, err := u.repo.CategoryNames(ctx, userID)
	if err != nil {
		return nil, err
	}
	counterparties, err := u.repo.DebtCounterparties(ctx, userID)
	if err != nil {
		return nil, err
	}
	directions, err := u.repo.DebtDirections(ctx, userID)
	if err != nil {
		return nil, err
	}

	var file bytes.Buffer
	file.WriteString(csvBOM)
	file.WriteString(csvHeader)
	file.WriteString("\r\n")

	for _, op := range operations {
		row := []string{
			op.Date.UTC().Format("2006-01-02"),
			operationTitle(op, directions),
			categoryName(op, categories),
			counterpartyName(op, counterparties),
			accountTitle(op, accounts),
			formatAmount(op.Amount),
			op.Currency,
			noteText(op),
		}
		for i, field := range row {
			if i > 0 {
				file.WriteString(";")
			}
			file.WriteString(escapeCSV(field))
		}
		file.WriteString("\r\n")
	}
	return file.Bytes(), nil
}

func operationTitle(op models.Operation, directions map[string]string) string {
	switch op.Kind {
	case models.KindExpense:
		return "Расход"
	case models.KindIncome:
		return "Доход"
	case models.KindDebt:
		if op.DebtDirection != nil && *op.DebtDirection == models.DebtTaken {
			return "Взял в долг"
		}
		return "Дал в долг"
	case models.KindRepayment:

		if op.DebtID != nil && directions[*op.DebtID] == models.DebtTaken {
			return "Вернул долг"
		}
		return "Вернули долг"
	case models.KindTransfer:
		return "Перевод"
	}
	return op.Kind
}

func categoryName(op models.Operation, categories map[string]string) string {
	if op.CategoryID == nil {
		return ""
	}
	return categories[*op.CategoryID]
}

func counterpartyName(op models.Operation, counterparties map[string]string) string {
	switch op.Kind {
	case models.KindDebt:
		if op.Counterparty != nil {
			return *op.Counterparty
		}
	case models.KindRepayment:
		if op.DebtID != nil {
			return counterparties[*op.DebtID]
		}
	}
	return ""
}

func accountTitle(op models.Operation, accounts map[string]string) string {
	name := accounts[op.AccountID]
	if op.Kind == models.KindTransfer && op.DestinationAccountID != nil {
		return name + " → " + accounts[*op.DestinationAccountID]
	}
	return name
}

func noteText(op models.Operation) string {
	if op.Note == nil {
		return ""
	}
	return *op.Note
}

func formatAmount(amount decimal.Decimal) string {
	return strings.Replace(amount.StringFixed(2), ".", ",", 1)
}

func escapeCSV(field string) string {
	if !strings.ContainsAny(field, ";\"\r\n") {
		return field
	}
	return `"` + strings.ReplaceAll(field, `"`, `""`) + `"`
}
