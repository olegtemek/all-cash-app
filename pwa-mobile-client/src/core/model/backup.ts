import { type Account, type Category, type MoneyOperation, type Payload, type SyncState } from './ledger'
import { pendingState } from './ledger'
import type { LedgerSnapshot } from './syncPayloads'
import { paletteColors } from './palette'

export const backupFormat = 'allcash-backup'
export const backupVersion = 1

export interface BackupFile {
  format: typeof backupFormat
  version: number
  exportedAt: string
  accounts: Account[]
  categories: Category[]
  operations: MoneyOperation[]
}

export type BackupError = { kind: 'notJSON' } | { kind: 'notBackup' } | { kind: 'newerVersion' } | { kind: 'invalid'; path: string }

export class BackupFailure extends Error {
  constructor(readonly error: BackupError) {
    super(error.kind)
  }
}

export function makeBackup(snapshot: LedgerSnapshot, now: Date = new Date()): BackupFile {
  return {
    format: backupFormat,
    version: backupVersion,
    exportedAt: now.toISOString(),
    accounts: snapshot.accounts,
    categories: snapshot.categories,
    operations: snapshot.operations
  }
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

// Backup carries local sync state, which is meaningless on another device.
// Every imported record becomes pending, so the next sync pushes it to the server.
export function parseBackup(text: string): LedgerSnapshot {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupFailure({ kind: 'notJSON' })
  }

  if (!isObject(raw) || raw.format !== backupFormat || typeof raw.version !== 'number') {
    throw new BackupFailure({ kind: 'notBackup' })
  }
  if (raw.version > backupVersion) throw new BackupFailure({ kind: 'newerVersion' })

  return {
    accounts: list(raw.accounts, 'accounts').map((item, index) => account(item, `accounts[${index}]`)),
    categories: list(raw.categories, 'categories').map((item, index) => category(item, `categories[${index}]`)),
    operations: list(raw.operations, 'operations').map((item, index) => operation(item, `operations[${index}]`))
  }
}

function fail(path: string): never {
  throw new BackupFailure({ kind: 'invalid', path })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path)
  return value
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) fail(path)
  return value
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path)
  return value
}

function nonEmpty(value: unknown, path: string): string {
  const result = text(value, path)
  if (result.length === 0) fail(path)
  return result
}

function amount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path)
  return value
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path)
  return value
}

function date(value: unknown, path: string): string {
  const result = text(value, path)
  if (Number.isNaN(Date.parse(result))) fail(path)
  return result
}

function optionalDate(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : date(value, path)
}

function common(record: Record<string, unknown>, path: string): { id: string; syncState: SyncState; deletedAt: string | null; seq: number | null } {
  return {
    id: nonEmpty(record.id, `${path}.id`),
    syncState: pendingState,
    deletedAt: optionalDate(record.deletedAt, `${path}.deletedAt`),
    seq: null
  }
}

function account(value: unknown, path: string): Account {
  const record = object(value, path)
  return {
    ...common(record, path),
    name: nonEmpty(record.name, `${path}.name`),
    currency: nonEmpty(record.currency, `${path}.currency`),
    initialBalance: amount(record.initialBalance, `${path}.initialBalance`),
    isArchived: flag(record.isArchived, `${path}.isArchived`),
    isHidden: flag(record.isHidden, `${path}.isHidden`)
  }
}

function category(value: unknown, path: string): Category {
  const record = object(value, path)
  const kinds = list(record.kinds, `${path}.kinds`).map((kind) => {
    if (kind !== 'expense' && kind !== 'income') fail(`${path}.kinds`)
    return kind
  })
  const color = text(record.color, `${path}.color`)
  if (!(paletteColors as readonly string[]).includes(color)) fail(`${path}.color`)

  return {
    ...common(record, path),
    name: nonEmpty(record.name, `${path}.name`),
    kinds,
    symbolName: text(record.symbolName, `${path}.symbolName`),
    color: color as Category['color']
  }
}

function moneyValue(value: unknown, path: string): { amount: number; currency: string } {
  const record = object(value, path)
  return { amount: amount(record.amount, `${path}.amount`), currency: nonEmpty(record.currency, `${path}.currency`) }
}

function payload(value: unknown, path: string): Payload {
  const record = object(value, path)
  const id = (key: string) => nonEmpty(record[key], `${path}.${key}`)

  switch (record.kind) {
    case 'expense':
    case 'income':
      return { kind: record.kind, category: id('category'), account: id('account'), amount: moneyValue(record.amount, `${path}.amount`) }
    case 'debt': {
      if (record.direction !== 'given' && record.direction !== 'taken') fail(`${path}.direction`)
      return {
        kind: 'debt',
        direction: record.direction,
        counterparty: text(record.counterparty, `${path}.counterparty`),
        account: id('account'),
        amount: moneyValue(record.amount, `${path}.amount`)
      }
    }
    case 'repayment':
      return { kind: 'repayment', debt: id('debt'), account: id('account'), amount: moneyValue(record.amount, `${path}.amount`) }
    case 'transfer':
      return {
        kind: 'transfer',
        from: id('from'),
        spent: moneyValue(record.spent, `${path}.spent`),
        to: id('to'),
        received: moneyValue(record.received, `${path}.received`)
      }
    default:
      return fail(`${path}.kind`)
  }
}

function operation(value: unknown, path: string): MoneyOperation {
  const record = object(value, path)
  const note = record.note
  if (note !== null && note !== undefined && typeof note !== 'string') fail(`${path}.note`)

  return {
    ...common(record, path),
    date: date(record.date, `${path}.date`),
    createdAt: date(record.createdAt, `${path}.createdAt`),
    note: note ?? null,
    payload: payload(record.payload, `${path}.payload`)
  }
}

export interface CSVLabels {
  header: string[]
  kinds: Record<Payload['kind'], string>
  directions: Record<'given' | 'taken', string>
  delimiter: ',' | ';'
}

const byteOrderMark = '﻿'

function escapeCell(value: string, delimiter: string): string {
  // Cells starting with these characters run as formulas in spreadsheets.
  const safe = /^[=+@\t\r]/.test(value) ? `'${value}` : value
  return safe.includes(delimiter) || /["\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function plainAmount(value: number): string {
  return value.toFixed(2)
}

export function operationsCSV(snapshot: LedgerSnapshot, labels: CSVLabels): string {
  const accounts = new Map(snapshot.accounts.map((item) => [item.id, item.name]))
  const categories = new Map(snapshot.categories.map((item) => [item.id, item.name]))
  const operations = snapshot.operations.filter((item) => item.deletedAt === null)
  const debts = new Map(operations.map((item) => [item.id, item]))

  const rows = [...operations]
    .sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt))
    .map((item) => {
      const p = item.payload
      const account = (id: string) => accounts.get(id) ?? ''
      let cells: string[]

      switch (p.kind) {
        case 'expense':
        case 'income':
          cells = [labels.kinds[p.kind], account(p.account), categories.get(p.category) ?? '', '', plainAmount(p.kind === 'expense' ? -p.amount.amount : p.amount.amount), p.amount.currency, '', '']
          break
        case 'debt':
          cells = [labels.kinds.debt, account(p.account), '', p.counterparty, plainAmount(p.direction === 'given' ? -p.amount.amount : p.amount.amount), p.amount.currency, '', labels.directions[p.direction]]
          break
        case 'repayment': {
          const origin = debts.get(p.debt)?.payload
          const counterparty = origin?.kind === 'debt' ? origin.counterparty : ''
          const given = origin?.kind === 'debt' && origin.direction === 'given'
          cells = [labels.kinds.repayment, account(p.account), '', counterparty, plainAmount(given ? p.amount.amount : -p.amount.amount), p.amount.currency, '', '']
          break
        }
        case 'transfer':
          cells = [labels.kinds.transfer, account(p.from), '', '', plainAmount(-p.spent.amount), p.spent.currency, `${account(p.to)}: ${plainAmount(p.received.amount)} ${p.received.currency}`, '']
          break
      }

      return [item.date.slice(0, 10), ...cells, item.note ?? '']
    })

  const lines = [labels.header, ...rows].map((row) => row.map((cell) => escapeCell(cell, labels.delimiter)).join(labels.delimiter))
  return byteOrderMark + lines.join('\r\n') + '\r\n'
}

export function backupFilename(kind: 'csv' | 'json', now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const stem = kind === 'csv' ? 'operations' : 'allcash-backup'
  return `${stem}-${now.getFullYear()}-${month}-${day}.${kind}`
}
