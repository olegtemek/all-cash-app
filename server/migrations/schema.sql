CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    login      TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT NOT NULL,
    user_id         TEXT NOT NULL REFERENCES users(id),
    name            TEXT NOT NULL,
    currency        TEXT NOT NULL,
    initial_balance TEXT NOT NULL DEFAULT '0.00',
    is_archived     INTEGER NOT NULL DEFAULT 0,
    is_hidden       INTEGER NOT NULL DEFAULT 0,
    deleted_at      TEXT,
    seq             INTEGER NOT NULL,
    updated_at      TEXT NOT NULL,
    PRIMARY KEY (id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_seq ON accounts(user_id, seq);

CREATE TABLE IF NOT EXISTS categories (
    id          TEXT NOT NULL,
    user_id     TEXT NOT NULL REFERENCES users(id),
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,
    symbol_name TEXT NOT NULL,
    color       TEXT NOT NULL,
    deleted_at  TEXT,
    seq         INTEGER NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_seq ON categories(user_id, seq);

CREATE TABLE IF NOT EXISTS operations (
    id                     TEXT NOT NULL,
    user_id                TEXT NOT NULL REFERENCES users(id),
    date                   TEXT NOT NULL,
    created_at             TEXT NOT NULL,
    note                   TEXT,
    kind                   TEXT NOT NULL,
    account_id             TEXT NOT NULL,
    amount                 TEXT NOT NULL,
    currency               TEXT NOT NULL,
    category_id            TEXT,
    counterparty           TEXT,
    debt_direction         TEXT,
    debt_id                TEXT,
    destination_account_id TEXT,
    destination_amount     TEXT,
    destination_currency   TEXT,
    deleted_at             TEXT,
    seq                    INTEGER NOT NULL,
    updated_at             TEXT NOT NULL,
    PRIMARY KEY (id, user_id),
    FOREIGN KEY (account_id, user_id) REFERENCES accounts(id, user_id),
    FOREIGN KEY (category_id, user_id) REFERENCES categories(id, user_id),
    FOREIGN KEY (debt_id, user_id) REFERENCES operations(id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_operations_seq ON operations(user_id, seq);
CREATE INDEX IF NOT EXISTS idx_operations_user_date ON operations(user_id, date);
CREATE INDEX IF NOT EXISTS idx_operations_debt ON operations(user_id, debt_id);
CREATE INDEX IF NOT EXISTS idx_operations_live ON operations(user_id, deleted_at);
