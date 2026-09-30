import { t } from '@/core/i18n'
import type { Account, Category, MoneyOperation, SyncState, UUID } from './ledger'
import { failedState, syncedState } from './ledger'

export interface PullPage {
  accounts: Account[]
  categories: Category[]
  operations: MoneyOperation[]
  nextSeq: number
  serverSeq: number | null
  hasMore: boolean
}

export function isPullPageEmpty(page: PullPage): boolean {
  return page.accounts.length === 0 && page.categories.length === 0 && page.operations.length === 0
}

export interface PushResult {
  accepted: Record<UUID, number>
  rejected: Record<UUID, string>
  finishedAt: string
}

export function isPushResultEmpty(result: PushResult): boolean {
  return Object.keys(result.accepted).length === 0 && Object.keys(result.rejected).length === 0
}

export function pushStates(result: PushResult): Record<UUID, SyncState> {
  const states: Record<UUID, SyncState> = {}
  for (const id of Object.keys(result.accepted)) states[id] = syncedState
  for (const [id, reason] of Object.entries(result.rejected)) states[id] = failedState(reason)
  return states
}

export function pushFailureNote(result: PushResult): string | null {
  const reasons = Object.values(result.rejected).sort()
  const reason = reasons[0]
  if (reason === undefined) return null
  return Object.keys(result.accepted).length === 0 ? reason : t('sync.partialFailure', { reason })
}

export interface LedgerSnapshot {
  accounts: Account[]
  categories: Category[]
  operations: MoneyOperation[]
}

export function emptySnapshot(): LedgerSnapshot {
  return { accounts: [], categories: [], operations: [] }
}

export function isSnapshotEmpty(snapshot: LedgerSnapshot): boolean {
  return snapshot.accounts.length === 0 && snapshot.categories.length === 0 && snapshot.operations.length === 0
}
