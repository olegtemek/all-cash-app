# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`all-cash-server` is the sync backend for the `all-cash` personal finance app (clients: the iOS app and the
web PWA in `../pwa-mobile-client`). It keeps a server-side copy of every user's data, syncs it with the device in both
directions via a cursor-based protocol, and produces a CSV export. Go + single-file SQLite, no cgo.

The server is designed to run on a LAN only: login is a bare login string with no password, and
`POST /auth/register` is unauthenticated. See `README.md` (in Russian) for the deployment constraints
this implies — do not "improve" the port exposure or open `/auth/register` to the internet without the
protections described there.

## Documentation map

- `ARCHITECTURE.md` — the full architecture: boundaries, layers, data flows, schema, invariants, known
  gaps. **Read it before changing anything structural.**
- `docs/adr/` — Architecture Decision Records. Currently one file, `0001-backend-architecture.md`, which
  holds every current decision as a numbered section (`п. 1` … `п. 23`) with context, consequences and
  rejected options. `ARCHITECTURE.md` cites it as `ADR-0001, п. N`.
- `README.md` — deployment and operations (in Russian).

**Work against the ADR.** Before a structural change, read `docs/adr/0001-backend-architecture.md` and
find the section that covers it. If the change contradicts a section, do not silently deviate: add a new
numbered ADR next to it (`0002-<short-name>.md`, same format: Статус / Дата / Контекст / Решения /
Последствия / Отклонённые варианты), name the section of ADR-0001 it changes or replaces, and update the
relevant `ARCHITECTURE.md` section in the same change. Existing ADRs are not rewritten: a superseded
section gets a note pointing at the new ADR. A brand-new decision also goes into a new ADR, not into
ADR-0001. There is no ADR index or template file. Section 10 of `ARCHITECTURE.md` lists the known gaps;
tasks usually come from there.

Documentation is written in Russian, matching the rest of the project docs.

## Commands

```sh
cp ../.env.example ../.env    # .env lives in the repo root; ALL_CASH_APP_DB_PATH is required, no default
make run                # go run ./cmd/server

go test ./...                                  # all tests
go test -race ./...
go test ./internal/usecase -run TestPush         # single test (usecase is the only tested package)

docker compose up -d    # port bound to 127.0.0.1
ALL_CASH_BIND_ADDRESS=192.168.1.10 docker compose up -d   # expose to the LAN
go vet ./...

CGO_ENABLED=0 go build -o bin/server ./cmd/server
```

`make` (run from `backend/`) includes and exports `../.env` and prefixes a relative `ALL_CASH_APP_DB_PATH` with `../`, so the local database is the repo-root `data/`, the same one docker compose mounts. The binaries also read `.env` through
`godotenv/autoload`, but from the *current directory* only, so without `make` run them from the repo
root or export the variables. Real environment variables win over the file.

Only `internal/usecase` has tests, deliberately (ADR-0001, п. 18): add new coverage there, and if a rule
needs a database to test, it is in the wrong layer.

`api.http` holds ready-made requests for every endpoint (note: its `@host` points at port 8080 while
the default `ALL_CASH_SERVER_PORT` is 8000).

## Architecture

Three layers, each depending only on the one below, with the interface declared by the *consumer*:

- `internal/transport/http` — chi router, middleware, handlers. Declares the `Usecase` interface it
  needs (`handlers.go`).
- `internal/usecase` — business rules. Declares the `Repository` interface it needs (`usecase.go`).
  **The only tested layer**, against a hand-written mock in `mocks_test.go`, no database (ADR-0001, п. 18).
- `internal/repository` — SQLite. Not covered by tests; verify SQL changes by hand via `api.http`.
- `internal/models` — shared structs plus the request/response DTO layer; no dependencies on the above.
- `migrations` — `schema.sql` embedded into the binary via `go:embed`; `repository.New` executes it on startup.

Wiring happens in `cmd/server/main.go`: config → repository → usecase → HTTP server.

### Schema ownership

`repository.New` executes the whole of `migrations/schema.sql` on every startup. The script is written
with `IF NOT EXISTS`, so re-running is safe, but existing tables are never altered. When you change
the schema, edit `schema.sql` and keep it idempotent — there is no versioned-migration machinery.

### The sync cursor (`seq`)

There is **one monotonic `seq` sequence per user, shared by accounts, categories and operations**.
`repository.nextSeq` computes it as `MAX(seq) + 1` over the union of all three tables for that user,
inside the same transaction as the write; every row therefore has a unique `seq` within a user.
`GET /pull?since=N` returns everything with `seq > N` from all three tables and reports `next_seq`.

Consequences to preserve:

- Only `/pull` moves the client's cursor. `/push` never does.
- `repository.Changes` over-fetches `limit + 1` rows per table, then finds the `limit`-th smallest
  `seq` across the three result sets and cuts at that boundary, setting `HasMore`. This keeps a page
  from splitting a single `seq`. `usecase.Pull` clamps `limit` to `pullLimitCeiling` (5000).
- Writes are serialized: `repository.New` pins the pool to a single connection
  (`SetMaxOpenConns(1)`), which is what makes the read-then-write `nextSeq` safe.

### Two-stage validation, and partial success on push

Syntactic validation lives in `internal/models/requests.go` (`Validate()` + `ToModel()` on each
`*Request` type): UUID form, enum membership, RFC3339 dates, parseable decimals, and — via
`requiredFields`/`checkFieldSet` — that exactly the fields belonging to the operation `kind` are
present and no others are.

Semantic validation lives in `internal/usecase`. It needs the database (account exists, currency
matches, category kind matches, repayments do not exceed the debt, transfer accounts differ). These
checks return a **rejection reason string, not an `error`**; a returned `error` means an infrastructure
failure and becomes a 500. Reason constants are the `reason*` block at the top of `usecase.go`.

`POST /push` answers `200` with `{accepted, rejected}` maps even when some records fail:

- a malformed **account or category** aborts the whole request with `422 schema_error` (reference data
  must be consistent);
- a malformed or semantically invalid **operation** lands in `rejected` keyed by its id, and the rest
  still save;
- soft-deleted records (`deleted_at != nil`) skip validation entirely, so a delete always syncs.

`usecase.sortOperations` moves `kind == "debt"` operations to the front of the batch so that a
repayment arriving in the same push can resolve its `debt_id`.

### Auth

`X-Login: <login>` on `/pull`, `/push`, `/export/csv`. The middleware resolves it to a user and puts a
`session` in the request context; handlers read it with `sessionFrom`. Logins are normalized with
`models.NormalizeLogin` (trim + lowercase) — the same rule as the client — everywhere, including
`/auth/login` and `/auth/register`.

Two distinct 401 codes, and the client behaves differently for each: `invalid_token` (unknown/missing
`X-Login`) makes it drop the session, `unknown_login` (from `/auth/login`) shows an error on the login
screen. Keep them separate.

### Errors

`models.errorSpecs` in `responses.go` is the single mapping from `ErrorCode` to HTTP status and default
message. Request bodies are capped at `maxBodyBytes` (10 MiB) by the `limitBody` middleware, and every
JSON body is read through `decodeJSON`, which turns `http.MaxBytesError` into `413 payload_too_large`
and any other decode failure into `400 bad_request` (ADR-0001, п. 21) — do not decode a body directly. Handlers call `respondErrorCode` / `respondError`; new error kinds go into that map. Internal
errors are logged by `Server.fail` and reported to the client as bare `internal_error`.

### Value formats

- Money is `shopspring/decimal` in Go, stored and sent as a `TEXT`/JSON string via `StringFixed(2)`.
  Never use floats for amounts.
- Timestamps are stored as `time.RFC3339Nano` text and always converted to UTC on the way in and out.
  The API uses a different layout, `models.TimeLayout` (`2006-01-02T15:04:05.000Z`) — use
  `models.FormatTime` / `FormatOptionalTime` for responses.
- Nullable columns go through `sql.NullString` and the `optionalString` / `parseOptionalTime` helpers
  in `repository.go`.

### CSV export

`usecase/export.go` builds the file in memory: UTF-8 BOM, `;` separator, CRLF line ends, comma as the
decimal point — the combination Excel opens correctly with Russian locale. Only live (non-deleted)
operations are exported. Ids are resolved to names through the `*Names` / `Debt*` lookup maps loaded
up front, not per row.

### Logging

Structured JSON via `log/slog`, one line per request from the `logging` middleware. Handlers enrich
that line by mutating the `logEntry` in the request context (`logEntryFrom`) with `since`, `next_seq`,
`records`, `accepted`, `rejected`. Logins, session headers and request bodies are deliberately never
logged.

## Conventions

- User-facing strings — validation messages, rejection reasons, CSV headers, error messages — are in
  Russian. Internal error text wrapped with `fmt.Errorf` and log messages are in English. Test names
  and test failure messages are in Russian.
- Dependencies are kept to the current short list in `go.mod`. Adding one needs a reason.
- The SQLite DSN (`busy_timeout`, `journal_mode(WAL)`, `foreign_keys(ON)`) is defined in
  `repository.dsn`.
- The repo-root `data/all_cash.db*` is a local development database (git-ignored), not fixtures.
