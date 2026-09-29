package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	_ "modernc.org/sqlite"

	"github.com/olegtemek/all-cash-server/internal/models"
)

const timeLayout = time.RFC3339Nano

type Repository struct {
	db *sql.DB
}

func New(path string) (*Repository, error) {
	db, err := sql.Open("sqlite", dsn(path))
	if err != nil {
		return nil, fmt.Errorf("repository: open database: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("repository: ping database: %w", err)
	}
	return &Repository{db: db}, nil
}

func (r *Repository) Close() error {
	return r.db.Close()
}

func (r *Repository) Ping(ctx context.Context) error {
	if err := r.db.PingContext(ctx); err != nil {
		return fmt.Errorf("repository: ping database: %w", err)
	}
	return nil
}

func dsn(path string) string {
	return "file:" + url.PathEscape(path) +
		"?_pragma=busy_timeout(5000)" +
		"&_pragma=journal_mode(WAL)" +
		"&_pragma=foreign_keys(ON)"
}

func (r *Repository) UserByLogin(ctx context.Context, login string) (models.User, error) {
	const query = "SELECT id, login, created_at FROM users WHERE login = ?"
	var user models.User
	var createdAt string
	err := r.db.QueryRowContext(ctx, query, login).Scan(&user.ID, &user.Login, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return models.User{}, models.ErrNotFound
	}
	if err != nil {
		return models.User{}, fmt.Errorf("repository: find user: %w", err)
	}
	if user.CreatedAt, err = time.Parse(timeLayout, createdAt); err != nil {
		return models.User{}, fmt.Errorf("repository: parse user created_at: %w", err)
	}
	return user, nil
}

func (r *Repository) CreateUser(ctx context.Context, login string) (models.User, error) {
	id, err := uuid.NewRandom()
	if err != nil {
		return models.User{}, fmt.Errorf("repository: generate user id: %w", err)
	}

	user := models.User{ID: id.String(), Login: login, CreatedAt: time.Now().UTC()}
	const query = "INSERT INTO users (id, login, created_at) VALUES (?, ?, ?)"
	if _, err := r.db.ExecContext(ctx, query, user.ID, user.Login, user.CreatedAt.Format(timeLayout)); err != nil {
		return models.User{}, fmt.Errorf("repository: create user: %w", err)
	}
	return user, nil
}

func (r *Repository) Account(ctx context.Context, userID, id string) (models.Account, error) {
	const query = `SELECT id, name, currency, initial_balance, is_archived, is_hidden, deleted_at, seq
		FROM accounts WHERE user_id = ? AND id = ?`
	account, err := scanAccount(r.db.QueryRowContext(ctx, query, userID, id))
	if err != nil {
		return models.Account{}, err
	}
	return account, nil
}

func (r *Repository) Category(ctx context.Context, userID, id string) (models.Category, error) {
	const query = `SELECT id, name, kind, symbol_name, color, deleted_at, seq
		FROM categories WHERE user_id = ? AND id = ?`
	return scanCategory(r.db.QueryRowContext(ctx, query, userID, id))
}

func (r *Repository) Operation(ctx context.Context, userID, id string) (models.Operation, error) {
	query := operationColumns + " FROM operations WHERE user_id = ? AND id = ?"
	return scanOperation(r.db.QueryRowContext(ctx, query, userID, id))
}

func (r *Repository) RepaymentsTotal(ctx context.Context, userID, debtID, excludeID string) (decimal.Decimal, error) {
	const query = `SELECT id, amount FROM operations
		WHERE user_id = ? AND debt_id = ? AND kind = ? AND deleted_at IS NULL`
	rows, err := r.db.QueryContext(ctx, query, userID, debtID, models.KindRepayment)
	if err != nil {
		return decimal.Zero, fmt.Errorf("repository: select debt repayments: %w", err)
	}
	defer rows.Close()

	total := decimal.Zero
	for rows.Next() {
		var id, raw string
		if err := rows.Scan(&id, &raw); err != nil {
			return decimal.Zero, err
		}
		if id == excludeID {
			continue
		}
		amount, err := decimal.NewFromString(raw)
		if err != nil {
			return decimal.Zero, fmt.Errorf("repository: parse repayment amount %s: %w", id, err)
		}
		total = total.Add(amount)
	}
	return total, rows.Err()
}

func (r *Repository) SaveAccount(ctx context.Context, userID string, account models.Account) (int64, error) {
	return r.save(ctx, userID, func(ctx context.Context, tx *sql.Tx, seq int64, now string) error {
		const query = `INSERT INTO accounts
			(id, user_id, name, currency, initial_balance, is_archived, is_hidden, deleted_at, seq, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id, user_id) DO UPDATE SET
				name = excluded.name,
				currency = excluded.currency,
				initial_balance = excluded.initial_balance,
				is_archived = excluded.is_archived,
				is_hidden = excluded.is_hidden,
				deleted_at = excluded.deleted_at,
				seq = excluded.seq,
				updated_at = excluded.updated_at`
		_, err := tx.ExecContext(ctx, query,
			account.ID, userID, account.Name, account.Currency,
			account.InitialBalance.StringFixed(2), account.IsArchived, account.IsHidden,
			formatOptionalTime(account.DeletedAt), seq, now)
		return err
	})
}

func (r *Repository) SaveCategory(ctx context.Context, userID string, category models.Category) (int64, error) {
	return r.save(ctx, userID, func(ctx context.Context, tx *sql.Tx, seq int64, now string) error {
		const query = `INSERT INTO categories
			(id, user_id, name, kind, symbol_name, color, deleted_at, seq, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id, user_id) DO UPDATE SET
				name = excluded.name,
				kind = excluded.kind,
				symbol_name = excluded.symbol_name,
				color = excluded.color,
				deleted_at = excluded.deleted_at,
				seq = excluded.seq,
				updated_at = excluded.updated_at`
		_, err := tx.ExecContext(ctx, query,
			category.ID, userID, category.Name, category.Kind,
			category.SymbolName, category.Color,
			formatOptionalTime(category.DeletedAt), seq, now)
		return err
	})
}

func (r *Repository) SaveOperation(ctx context.Context, userID string, op models.Operation) (int64, error) {
	return r.save(ctx, userID, func(ctx context.Context, tx *sql.Tx, seq int64, now string) error {
		const query = `INSERT INTO operations
			(id, user_id, date, created_at, note, kind, account_id, amount, currency,
			 category_id, counterparty, debt_direction, debt_id,
			 destination_account_id, destination_amount, destination_currency,
			 deleted_at, seq, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id, user_id) DO UPDATE SET
				date = excluded.date,
				created_at = excluded.created_at,
				note = excluded.note,
				kind = excluded.kind,
				account_id = excluded.account_id,
				amount = excluded.amount,
				currency = excluded.currency,
				category_id = excluded.category_id,
				counterparty = excluded.counterparty,
				debt_direction = excluded.debt_direction,
				debt_id = excluded.debt_id,
				destination_account_id = excluded.destination_account_id,
				destination_amount = excluded.destination_amount,
				destination_currency = excluded.destination_currency,
				deleted_at = excluded.deleted_at,
				seq = excluded.seq,
				updated_at = excluded.updated_at`
		_, err := tx.ExecContext(ctx, query,
			op.ID, userID,
			op.Date.UTC().Format(timeLayout), op.CreatedAt.UTC().Format(timeLayout),
			op.Note, op.Kind, op.AccountID, op.Amount.StringFixed(2), op.Currency,
			op.CategoryID, op.Counterparty, op.DebtDirection, op.DebtID,
			op.DestinationAccountID, formatOptionalAmount(op.DestinationAmount), op.DestinationCurrency,
			formatOptionalTime(op.DeletedAt), seq, now)
		return err
	})
}

func (r *Repository) save(
	ctx context.Context,
	userID string,
	write func(ctx context.Context, tx *sql.Tx, seq int64, now string) error,
) (int64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("repository: begin transaction: %w", err)
	}
	defer tx.Rollback()

	seq, err := nextSeq(ctx, tx, userID)
	if err != nil {
		return 0, err
	}
	if err := write(ctx, tx, seq, time.Now().UTC().Format(timeLayout)); err != nil {
		return 0, fmt.Errorf("repository: write row: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("repository: commit transaction: %w", err)
	}
	return seq, nil
}

func nextSeq(ctx context.Context, tx *sql.Tx, userID string) (int64, error) {
	const query = `SELECT COALESCE(MAX(seq), 0) + 1 FROM (
		SELECT seq FROM accounts   WHERE user_id = ?
		UNION ALL SELECT seq FROM categories WHERE user_id = ?
		UNION ALL SELECT seq FROM operations WHERE user_id = ?
	)`
	var seq int64
	if err := tx.QueryRowContext(ctx, query, userID, userID, userID).Scan(&seq); err != nil {
		return 0, fmt.Errorf("repository: assign seq: %w", err)
	}
	return seq, nil
}

func (r *Repository) Changes(ctx context.Context, userID string, since int64, limit int) (models.Changes, error) {
	var changes models.Changes
	fetch := limit + 1

	accounts, err := r.accountsSince(ctx, userID, since, fetch)
	if err != nil {
		return models.Changes{}, err
	}
	categories, err := r.categoriesSince(ctx, userID, since, fetch)
	if err != nil {
		return models.Changes{}, err
	}
	operations, err := r.operationsSince(ctx, userID, since, fetch)
	if err != nil {
		return models.Changes{}, err
	}

	total := len(accounts) + len(categories) + len(operations)
	if total <= limit {
		changes.Accounts, changes.Categories, changes.Operations = accounts, categories, operations
		return changes, nil
	}

	boundary := nthSeq(accounts, categories, operations, limit)
	for _, account := range accounts {
		if account.Seq <= boundary {
			changes.Accounts = append(changes.Accounts, account)
		}
	}
	for _, category := range categories {
		if category.Seq <= boundary {
			changes.Categories = append(changes.Categories, category)
		}
	}
	for _, operation := range operations {
		if operation.Seq <= boundary {
			changes.Operations = append(changes.Operations, operation)
		}
	}
	changes.HasMore = true
	return changes, nil
}

func nthSeq(accounts []models.Account, categories []models.Category, operations []models.Operation, limit int) int64 {
	all := make([]int64, 0, len(accounts)+len(categories)+len(operations))
	for _, account := range accounts {
		all = append(all, account.Seq)
	}
	for _, category := range categories {
		all = append(all, category.Seq)
	}
	for _, operation := range operations {
		all = append(all, operation.Seq)
	}
	sort.Slice(all, func(i, j int) bool { return all[i] < all[j] })
	return all[limit-1]
}

func (r *Repository) accountsSince(ctx context.Context, userID string, since int64, limit int) ([]models.Account, error) {
	const query = `SELECT id, name, currency, initial_balance, is_archived, is_hidden, deleted_at, seq
		FROM accounts WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?`
	rows, err := r.db.QueryContext(ctx, query, userID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("repository: select account changes: %w", err)
	}
	defer rows.Close()

	var accounts []models.Account
	for rows.Next() {
		account, err := scanAccount(rows)
		if err != nil {
			return nil, err
		}
		accounts = append(accounts, account)
	}
	return accounts, rows.Err()
}

func (r *Repository) categoriesSince(ctx context.Context, userID string, since int64, limit int) ([]models.Category, error) {
	const query = `SELECT id, name, kind, symbol_name, color, deleted_at, seq
		FROM categories WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?`
	rows, err := r.db.QueryContext(ctx, query, userID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("repository: select category changes: %w", err)
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		category, err := scanCategory(rows)
		if err != nil {
			return nil, err
		}
		categories = append(categories, category)
	}
	return categories, rows.Err()
}

func (r *Repository) operationsSince(ctx context.Context, userID string, since int64, limit int) ([]models.Operation, error) {
	query := operationColumns + " FROM operations WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?"
	rows, err := r.db.QueryContext(ctx, query, userID, since, limit)
	if err != nil {
		return nil, fmt.Errorf("repository: select operation changes: %w", err)
	}
	defer rows.Close()

	var operations []models.Operation
	for rows.Next() {
		operation, err := scanOperation(rows)
		if err != nil {
			return nil, err
		}
		operations = append(operations, operation)
	}
	return operations, rows.Err()
}

func (r *Repository) LiveOperations(ctx context.Context, userID string) ([]models.Operation, error) {
	query := operationColumns + ` FROM operations
		WHERE user_id = ? AND deleted_at IS NULL
		ORDER BY date, created_at`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("repository: select live operations: %w", err)
	}
	defer rows.Close()

	var operations []models.Operation
	for rows.Next() {
		operation, err := scanOperation(rows)
		if err != nil {
			return nil, err
		}
		operations = append(operations, operation)
	}
	return operations, rows.Err()
}

func (r *Repository) AccountNames(ctx context.Context, userID string) (map[string]string, error) {
	return r.namesMap(ctx, "SELECT id, name FROM accounts WHERE user_id = ?", userID, "account names")
}

func (r *Repository) CategoryNames(ctx context.Context, userID string) (map[string]string, error) {
	return r.namesMap(ctx, "SELECT id, name FROM categories WHERE user_id = ?", userID, "category names")
}

func (r *Repository) DebtCounterparties(ctx context.Context, userID string) (map[string]string, error) {
	const query = `SELECT id, COALESCE(counterparty, '') FROM operations
		WHERE user_id = ? AND kind = '` + models.KindDebt + `'`
	return r.namesMap(ctx, query, userID, "debt counterparties")
}

func (r *Repository) DebtDirections(ctx context.Context, userID string) (map[string]string, error) {
	const query = `SELECT id, COALESCE(debt_direction, '') FROM operations
		WHERE user_id = ? AND kind = '` + models.KindDebt + `'`
	return r.namesMap(ctx, query, userID, "debt directions")
}

func (r *Repository) namesMap(ctx context.Context, query, userID, subject string) (map[string]string, error) {
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("repository: %s: %w", subject, err)
	}
	defer rows.Close()

	names := map[string]string{}
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		names[id] = name
	}
	return names, rows.Err()
}

const operationColumns = `SELECT id, date, created_at, note, kind, account_id, amount, currency,
	category_id, counterparty, debt_direction, debt_id,
	destination_account_id, destination_amount, destination_currency, deleted_at, seq`

type scanner interface {
	Scan(dest ...any) error
}

func scanAccount(row scanner) (models.Account, error) {
	var account models.Account
	var balance string
	var deletedAt sql.NullString

	err := row.Scan(&account.ID, &account.Name, &account.Currency, &balance,
		&account.IsArchived, &account.IsHidden, &deletedAt, &account.Seq)
	if errors.Is(err, sql.ErrNoRows) {
		return models.Account{}, models.ErrNotFound
	}
	if err != nil {
		return models.Account{}, fmt.Errorf("repository: scan account: %w", err)
	}
	if account.InitialBalance, err = decimal.NewFromString(balance); err != nil {
		return models.Account{}, fmt.Errorf("repository: parse account initial balance %s: %w", account.ID, err)
	}
	if account.DeletedAt, err = parseOptionalTime(deletedAt); err != nil {
		return models.Account{}, err
	}
	return account, nil
}

func scanCategory(row scanner) (models.Category, error) {
	var category models.Category
	var deletedAt sql.NullString

	err := row.Scan(&category.ID, &category.Name, &category.Kind, &category.SymbolName,
		&category.Color, &deletedAt, &category.Seq)
	if errors.Is(err, sql.ErrNoRows) {
		return models.Category{}, models.ErrNotFound
	}
	if err != nil {
		return models.Category{}, fmt.Errorf("repository: scan category: %w", err)
	}
	if category.DeletedAt, err = parseOptionalTime(deletedAt); err != nil {
		return models.Category{}, err
	}
	return category, nil
}

func scanOperation(row scanner) (models.Operation, error) {
	var op models.Operation
	var date, createdAt, amount string
	var note, categoryID, counterparty, debtDirection, debtID sql.NullString
	var destinationAccountID, destinationAmount, destinationCurrency, deletedAt sql.NullString

	err := row.Scan(&op.ID, &date, &createdAt, &note, &op.Kind, &op.AccountID, &amount, &op.Currency,
		&categoryID, &counterparty, &debtDirection, &debtID,
		&destinationAccountID, &destinationAmount, &destinationCurrency, &deletedAt, &op.Seq)
	if errors.Is(err, sql.ErrNoRows) {
		return models.Operation{}, models.ErrNotFound
	}
	if err != nil {
		return models.Operation{}, fmt.Errorf("repository: scan operation: %w", err)
	}

	if op.Date, err = time.Parse(timeLayout, date); err != nil {
		return models.Operation{}, fmt.Errorf("repository: parse operation date %s: %w", op.ID, err)
	}
	if op.CreatedAt, err = time.Parse(timeLayout, createdAt); err != nil {
		return models.Operation{}, fmt.Errorf("repository: parse operation created_at %s: %w", op.ID, err)
	}
	if op.Amount, err = decimal.NewFromString(amount); err != nil {
		return models.Operation{}, fmt.Errorf("repository: parse operation amount %s: %w", op.ID, err)
	}
	if op.DeletedAt, err = parseOptionalTime(deletedAt); err != nil {
		return models.Operation{}, err
	}

	op.Note = optionalString(note)
	op.CategoryID = optionalString(categoryID)
	op.Counterparty = optionalString(counterparty)
	op.DebtDirection = optionalString(debtDirection)
	op.DebtID = optionalString(debtID)
	op.DestinationAccountID = optionalString(destinationAccountID)
	op.DestinationCurrency = optionalString(destinationCurrency)

	if destinationAmount.Valid {
		parsed, err := decimal.NewFromString(destinationAmount.String)
		if err != nil {
			return models.Operation{}, fmt.Errorf("repository: parse operation destination amount %s: %w", op.ID, err)
		}
		op.DestinationAmount = &parsed
	}
	return op, nil
}

func optionalString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	text := value.String
	return &text
}

func parseOptionalTime(value sql.NullString) (*time.Time, error) {
	if !value.Valid {
		return nil, nil
	}
	parsed, err := time.Parse(timeLayout, value.String)
	if err != nil {
		return nil, fmt.Errorf("repository: parse time %q: %w", value.String, err)
	}
	utc := parsed.UTC()
	return &utc, nil
}

func formatOptionalTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.UTC().Format(timeLayout)
}

func formatOptionalAmount(value *decimal.Decimal) any {
	if value == nil {
		return nil
	}
	return value.StringFixed(2)
}
