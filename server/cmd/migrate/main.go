package main

import (
	"database/sql"
	"flag"
	"fmt"
	"net/url"
	"os"

	_ "modernc.org/sqlite"

	"github.com/olegtemek/all-cash-server/internal/config"
	"github.com/olegtemek/all-cash-server/migrations"
)

func main() {
	dbPath := flag.String("db", "", "path to the SQLite file (APP_DB_PATH is used when empty)")
	flag.Parse()

	if err := run(*dbPath); err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		os.Exit(1)
	}
}

func run(dbPath string) error {
	if dbPath == "" {
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		dbPath = cfg.App.DBPath
	}

	dsn := "file:" + url.PathEscape(dbPath) +
		"?_pragma=busy_timeout(5000)" +
		"&_pragma=journal_mode(WAL)" +
		"&_pragma=foreign_keys(ON)"

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(migrations.Schema); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	if err := addColumnIfMissing(tx, "accounts", "is_hidden", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit schema: %w", err)
	}

	fmt.Printf("schema applied: %s\n", dbPath)
	return nil
}

// addColumnIfMissing дополняет уже существующую таблицу колонкой, которой нет в
// старой базе: schema.sql написан через CREATE TABLE IF NOT EXISTS и такие
// таблицы не трогает.
func addColumnIfMissing(tx *sql.Tx, table, column, definition string) error {
	rows, err := tx.Query("SELECT 1 FROM pragma_table_info(?) WHERE name = ?", table, column)
	if err != nil {
		return fmt.Errorf("inspect %s.%s: %w", table, column, err)
	}
	exists := rows.Next()
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("inspect %s.%s: %w", table, column, err)
	}
	rows.Close()
	if exists {
		return nil
	}

	statement := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition)
	if _, err := tx.Exec(statement); err != nil {
		return fmt.Errorf("add column %s.%s: %w", table, column, err)
	}
	return nil
}
