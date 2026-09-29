package models

import (
	"errors"
	"time"

	"github.com/shopspring/decimal"
)

const (
	KindExpense   = "expense"
	KindIncome    = "income"
	KindDebt      = "debt"
	KindRepayment = "repayment"
	KindTransfer  = "transfer"
)

const (
	DebtGiven = "given"
	DebtTaken = "taken"
)

const (
	CategoryExpense = "expense"
	CategoryIncome  = "income"
)

var Kinds = map[string]bool{KindExpense: true, KindIncome: true, KindDebt: true, KindRepayment: true, KindTransfer: true}

var Currencies = map[string]bool{"KZT": true, "USD": true, "CNY": true, "RUB": true}

var Colors = map[string]bool{
	"red": true, "orange": true, "yellow": true, "green": true,
	"mint": true, "teal": true, "blue": true, "indigo": true,
	"purple": true, "pink": true, "brown": true, "graphite": true,
}

var DebtDirections = map[string]bool{DebtGiven: true, DebtTaken: true}

const (
	MaxNoteLen         = 500
	MaxCounterpartyLen = 100
	MaxNameLen         = 100
)

type User struct {
	ID        string
	Login     string
	CreatedAt time.Time
}

type Account struct {
	ID             string
	Name           string
	Currency       string
	InitialBalance decimal.Decimal
	IsArchived     bool
	IsHidden       bool
	DeletedAt      *time.Time
	Seq            int64
}

type Category struct {
	ID         string
	Name       string
	Kind       string
	SymbolName string
	Color      string
	DeletedAt  *time.Time
	Seq        int64
}

type Operation struct {
	ID                   string
	Date                 time.Time
	CreatedAt            time.Time
	Note                 *string
	Kind                 string
	AccountID            string
	Amount               decimal.Decimal
	Currency             string
	CategoryID           *string
	Counterparty         *string
	DebtDirection        *string
	DebtID               *string
	DestinationAccountID *string
	DestinationAmount    *decimal.Decimal
	DestinationCurrency  *string
	DeletedAt            *time.Time
	Seq                  int64
}

type Changes struct {
	Accounts   []Account
	Categories []Category
	Operations []Operation
	HasMore    bool
}

func (c Changes) Total() int {
	return len(c.Accounts) + len(c.Categories) + len(c.Operations)
}

func (c Changes) MaxSeq() int64 {
	var max int64
	for _, a := range c.Accounts {
		if a.Seq > max {
			max = a.Seq
		}
	}
	for _, c := range c.Categories {
		if c.Seq > max {
			max = c.Seq
		}
	}
	for _, o := range c.Operations {
		if o.Seq > max {
			max = o.Seq
		}
	}
	return max
}

type PushResult struct {
	Accepted map[string]int64
	Rejected map[string]string
}

var ErrNotFound = errors.New("models: record not found")
