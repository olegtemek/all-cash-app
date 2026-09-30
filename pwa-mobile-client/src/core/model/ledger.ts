import { t } from '@/core/i18n'
import type { CurrencyCode, Money } from './money'
import type { PaletteColor } from './palette'

export type UUID = string

export type SyncState = { kind: 'pending' } | { kind: 'synced' } | { kind: 'failed'; reason: string }

export const pendingState: SyncState = { kind: 'pending' }
export const syncedState: SyncState = { kind: 'synced' }
export function failedState(reason: string): SyncState {
  return { kind: 'failed', reason }
}

export function isSynced(state: SyncState): boolean {
  return state.kind === 'synced'
}

export function isFailed(state: SyncState): boolean {
  return state.kind === 'failed'
}

export function syncSymbol(state: SyncState): string | null {
  switch (state.kind) {
    case 'pending':
      return 'icloud.and.arrow.up'
    case 'synced':
      return null
    case 'failed':
      return 'exclamationmark.icloud'
  }
}

export function syncSpokenNote(state: SyncState): string | null {
  switch (state.kind) {
    case 'pending':
      return t('sync.spoken.pending')
    case 'synced':
      return null
    case 'failed':
      return t('sync.spoken.failed', { reason: state.reason })
  }
}

export interface Synchronizable {
  id: UUID
  syncState: SyncState
  deletedAt: string | null
  seq: number | null
}

export function isDeleted(record: Synchronizable): boolean {
  return record.deletedAt !== null
}

export function isPending(record: Synchronizable): boolean {
  return !isSynced(record.syncState)
}

export interface Account extends Synchronizable {
  name: string
  currency: CurrencyCode
  initialBalance: number
  isArchived: boolean
  isHidden: boolean
}

export type CategoryKind = 'expense' | 'income'

export const categoryKinds: CategoryKind[] = ['expense', 'income']

export interface Category extends Synchronizable {
  name: string
  kinds: CategoryKind[]
  symbolName: string
  color: PaletteColor
}

export function categoryApplies(category: Category, kind: CategoryKind): boolean {
  return category.kinds.includes(kind)
}

export function kindTitle(kind: CategoryKind): string {
  return kind === 'expense' ? t('common.expense') : t('common.income')
}

export function kindPluralTitle(kind: CategoryKind): string {
  return kind === 'expense' ? t('kind.expenseCategories') : t('kind.incomeCategories')
}

export function kindsTitle(kinds: CategoryKind[]): string {
  return categoryKinds
    .filter((kind) => kinds.includes(kind))
    .map(kindTitle)
    .join(' · ')
}

export type DebtDirection = 'given' | 'taken'

export interface DebtOrigin {
  direction: DebtDirection
  counterparty: string
}

export type Payload =
  | { kind: 'expense'; category: UUID; account: UUID; amount: Money }
  | { kind: 'income'; category: UUID; account: UUID; amount: Money }
  | { kind: 'debt'; direction: DebtDirection; counterparty: string; account: UUID; amount: Money }
  | { kind: 'repayment'; debt: UUID; account: UUID; amount: Money }
  | { kind: 'transfer'; from: UUID; spent: Money; to: UUID; received: Money }

export interface MoneyOperation extends Synchronizable {
  date: string
  createdAt: string
  note: string | null
  payload: Payload
}

export function affectedAccounts(operation: MoneyOperation): UUID[] {
  const payload = operation.payload
  return payload.kind === 'transfer' ? [payload.from, payload.to] : [payload.account]
}

export function primaryAccount(operation: MoneyOperation): UUID {
  const payload = operation.payload
  return payload.kind === 'transfer' ? payload.from : payload.account
}

export function balanceEffect(
  operation: MoneyOperation,
  accountID: UUID,
  debtOrigin: DebtOrigin | null = null
): number {
  const payload = operation.payload

  switch (payload.kind) {
    case 'expense':
      return payload.account === accountID ? -payload.amount.amount : 0

    case 'income':
      return payload.account === accountID ? payload.amount.amount : 0

    case 'debt':
      if (payload.account !== accountID) return 0
      return payload.direction === 'given' ? -payload.amount.amount : payload.amount.amount

    case 'repayment': {
      if (payload.account !== accountID || !debtOrigin) return 0
      return debtOrigin.direction === 'given' ? payload.amount.amount : -payload.amount.amount
    }

    case 'transfer': {
      let delta = 0
      if (payload.from === accountID) delta -= payload.spent.amount
      if (payload.to === accountID) delta += payload.received.amount
      return delta
    }
  }
}

export function newUUID(): UUID {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
