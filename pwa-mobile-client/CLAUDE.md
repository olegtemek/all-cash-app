# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server (`host: true`, PWA service worker enabled in dev via `dev-dist/`)
- `npm run build` — `vue-tsc -b && vite build` (typecheck gates the build), output in `dist/`
- `npm run typecheck` — `vue-tsc --noEmit`
- `npm run icons` — regenerate PWA icons in `public/` via `scripts/generate-icons.mjs`
- No test runner, no linter configured.
- Docker: multi-stage build (node 22 → nginx). `nginx.conf` serves SPA fallback, never caches `sw.js`/manifest, caches `/assets/` immutable.

## Architecture

All work in this repository follows the ADRs in `docs/adr/`. They are the source of truth for architecture decisions. Before starting any task, read the relevant ADRs, starting with `docs/adr/0001-web-client-architecture.md`, and do not contradict them. If a task requires a new or changed decision, record it as a new numbered ADR before or together with the code change.

AllCash: offline-first personal finance PWA (Vue 3 + TypeScript + Vite, `@` alias → `src/`). UI text is Russian. Web port of an iOS/SwiftUI app (Swift-style naming such as `UUID`, `serverStatusSymbol` returning SF Symbol names).

Layers under `src/`:

- `core/model/` — pure domain logic, no Vue. Ledger types (`ledger.ts`), money/decimal math, analytics, validation rules, sync payload types.
- `core/data/` — `LedgerRepository` interface (`repository.ts`) with the IndexedDB implementation (`idbRepository.ts`, via `idb`). Stores: `accounts`, `categories`, `operations`. Tracks pending changes and soft deletes for sync.
- `core/network/` — `APIClient` (fetch wrapper, `X-Login` header, 60s timeout), DTOs, and `mapping.ts` converting DTO ↔ model. Errors are `APIFailure`/`APIError` unions.
- `core/store/ledgerStore.ts` — `LedgerStore` singleton (`ledgerStore`). Holds all data in memory, derives view models (`models.ts`: day groups, account/debt summaries, currency totals) into `shallowRef`s, persists through the repository.
- `features/*` — screens plus feature stores (`authStore`, `syncStore`, `exportStore`), also module-level singleton classes exporting Vue refs.
- `design/` — shared UI components and `theme.css`.

Key patterns:

- **No Pinia/provide-inject.** Stores are class singletons imported directly by components. `MainTabView.vue` wires them: loads ledger, triggers auto-sync on mount and on `visibilitychange`, and reacts to `sessionExpired` from sync/export by calling `authStore.sessionExpired()`.
- **Routing** (`router.ts`) is just the four tab routes (`operations`, `accounts`, `analytics`, `settings`). Everything else (operation form, sheets, debt detail) is in-component state overlaid on `MainTabView`.
- **Sync** (`syncStore.ts`) is pull/push with server sequence (`sync.lastSeq`, `sync.lastSyncedAt` in localStorage), paged pull, chunked push, 60s automatic interval. Records carry pending state; `applyPulled`/`applyPushResult` reconcile them in the repository.
- **Money** is plain `number` with 2-decimal scale; always use helpers in `core/model/decimal.ts` (`add`, `rounded`, …), never raw float arithmetic.
- Strict TS with `noUnusedLocals`/`noUnusedParameters` — unused code fails the build.
