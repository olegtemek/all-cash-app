import { t } from '@/core/i18n'
import { computed, ref } from 'vue'
import type { LedgerStore } from '@/core/store/ledgerStore'
import { APIClient } from '@/core/network/apiClient'
import { apiErrorText, asAPIError, isSessionExpired, type APIError } from '@/core/network/apiError'
import type { PullResponseDTO, PushResponseDTO } from '@/core/network/dto'
import { pullPageFromDTO, pushRequestDTO, pushResultFromDTO } from '@/core/network/mapping'
import type { LedgerSnapshot, PullPage, PushResult } from '@/core/model/syncPayloads'
import { emptySnapshot, isSnapshotEmpty, pushFailureNote } from '@/core/model/syncPayloads'
import type { UserSession } from '@/features/auth/authStore'

export type SyncError =
  | { kind: 'notSignedIn' }
  | { kind: 'sessionExpired' }
  | { kind: 'serverUnreachable' }
  | { kind: 'serverFailure'; message: string }

export function syncErrorText(error: SyncError): string {
  switch (error.kind) {
    case 'notSignedIn':
      return t('sync.needSignIn')
    case 'sessionExpired':
      return t('sync.unknownLogin')
    case 'serverUnreachable':
      return t('sync.offline')
    case 'serverFailure':
      return error.message
  }
}

export function syncErrorFromAPI(error: APIError): SyncError {
  switch (error.kind) {
    case 'unreachable':
      return { kind: 'serverUnreachable' }
    case 'malformedServer':
    case 'decoding':
      return { kind: 'serverFailure', message: apiErrorText(error) }
    case 'status':
      return isSessionExpired(error)
        ? { kind: 'sessionExpired' }
        : { kind: 'serverFailure', message: apiErrorText(error) }
  }
}

const pageLimit = 2000
const maxPages = 100
const pushChunkSize = 400
const automaticInterval = 60_000

const keys = {
  lastSyncedAt: 'sync.lastSyncedAt',
  lastSeq: 'sync.lastSeq'
}

function readNumber(key: string): number {
  const raw = localStorage.getItem(key)
  const value = raw === null ? 0 : Number(raw)
  return Number.isFinite(value) ? value : 0
}

export class SyncStore {
  readonly isSyncing = ref(false)
  readonly lastSyncedAt = ref<string | null>(null)
  readonly lastSeq = ref(0)
  readonly error = ref<string | null>(null)
  readonly sessionExpired = ref(false)

  private lastAttemptAt: number | null = null

  readonly lastSyncedDate = computed(() => (this.lastSyncedAt.value ? new Date(this.lastSyncedAt.value) : null))

  constructor() {
    const stored = readNumber(keys.lastSyncedAt)
    this.lastSyncedAt.value = stored > 0 ? new Date(stored).toISOString() : null
    this.lastSeq.value = readNumber(keys.lastSeq)
  }

  async sync(ledger: LedgerStore, session: UserSession | null): Promise<void> {
    await this.run(ledger, session, false)
  }

  async syncAutomatically(ledger: LedgerStore, session: UserSession | null): Promise<void> {
    if (!session) return
    if (this.lastAttemptAt !== null && Date.now() - this.lastAttemptAt < automaticInterval) return

    await this.run(ledger, session, true)
  }

  private async run(ledger: LedgerStore, session: UserSession | null, isAutomatic: boolean): Promise<void> {
    if (this.isSyncing.value) return

    this.error.value = null

    if (!session) {
      this.error.value = syncErrorText({ kind: 'notSignedIn' })
      return
    }

    this.isSyncing.value = true
    this.lastAttemptAt = Date.now()

    try {
      await this.pull(ledger, session)
      if (await this.push(ledger, session)) await this.pull(ledger, session)
    } catch (error) {
      const syncError = error as SyncError
      if (syncError.kind === 'sessionExpired') this.sessionExpired.value = true
      if (!isAutomatic || syncError.kind === 'sessionExpired') {
        this.error.value = syncErrorText(syncError)
      }
    } finally {
      this.isSyncing.value = false
    }
  }

  acknowledgeSessionExpiry(): void {
    this.sessionExpired.value = false
  }

  private async pull(ledger: LedgerStore, session: UserSession): Promise<void> {
    let pages = 0
    let didResetCursor = false

    while (pages < maxPages) {
      const page = await pullPage(this.lastSeq.value, session)
      pages += 1

      // Local cursor ahead of the server: cursor is stale, pull everything again.
      if (!didResetCursor && page.serverSeq !== null && this.lastSeq.value > page.serverSeq) {
        didResetCursor = true
        this.resetCursor()
        continue
      }

      await ledger.applyPulled(page)

      this.lastSeq.value = Math.max(this.lastSeq.value, page.nextSeq)
      localStorage.setItem(keys.lastSeq, String(this.lastSeq.value))

      if (!page.hasMore) return
    }
  }

  private async push(ledger: LedgerStore, session: UserSession): Promise<boolean> {
    const changes = ledger.pendingChanges()
    if (isSnapshotEmpty(changes)) return false

    let failureNote: string | null = null
    let didSend = false

    for (const chunk of SyncStore.chunks(changes)) {
      const result = await pushChanges(chunk, session)
      await ledger.applyPushResult(result)
      didSend = true

      if (Object.keys(result.accepted).length > 0) {
        this.lastSyncedAt.value = result.finishedAt
        localStorage.setItem(keys.lastSyncedAt, String(new Date(result.finishedAt).getTime()))
      }
      failureNote ??= pushFailureNote(result)
    }

    this.error.value = failureNote
    return didSend
  }

  static chunks(snapshot: LedgerSnapshot, limit = pushChunkSize): LedgerSnapshot[] {
    const debts = snapshot.operations.filter((operation) => operation.payload.kind === 'debt')
    const others = snapshot.operations.filter((operation) => operation.payload.kind !== 'debt')

    const chunks: LedgerSnapshot[] = []
    let current = emptySnapshot()
    let count = 0

    const flush = () => {
      if (count === 0) return
      chunks.push(current)
      current = emptySnapshot()
      count = 0
    }

    for (const account of snapshot.accounts) {
      current.accounts.push(account)
      count += 1
      if (count === limit) flush()
    }
    for (const category of snapshot.categories) {
      current.categories.push(category)
      count += 1
      if (count === limit) flush()
    }
    for (const operation of [...debts, ...others]) {
      current.operations.push(operation)
      count += 1
      if (count === limit) flush()
    }
    flush()

    return chunks
  }

  resetCursor(): void {
    this.lastSeq.value = 0
    localStorage.setItem(keys.lastSeq, '0')
  }

  resetState(): void {
    this.resetCursor()
    this.lastSyncedAt.value = null
    localStorage.removeItem(keys.lastSyncedAt)
    this.error.value = null
    this.lastAttemptAt = null
  }
}

function clientFor(session: UserSession): APIClient {
  const client = APIClient.create(session.server)
  if (!client) throw { kind: 'serverFailure', message: t('common.badServerAddress') } satisfies SyncError
  return client
}

async function pullPage(cursor: number, session: UserSession): Promise<PullPage> {
  const client = clientFor(session)

  try {
    const dto = await client.sendJSON<PullResponseDTO>({
      path: 'pull',
      query: { since: String(cursor), limit: String(pageLimit) },
      login: session.login
    })
    return pullPageFromDTO(dto)
  } catch (error) {
    const apiError = asAPIError(error)
    if (apiError) throw syncErrorFromAPI(apiError)
    throw error
  }
}

async function pushChanges(changes: LedgerSnapshot, session: UserSession): Promise<PushResult> {
  const client = clientFor(session)

  try {
    const dto = await client.sendJSON<PushResponseDTO>({
      method: 'POST',
      path: 'push',
      login: session.login,
      body: pushRequestDTO(changes)
    })
    return pushResultFromDTO(dto)
  } catch (error) {
    const apiError = asAPIError(error)
    if (apiError) throw syncErrorFromAPI(apiError)
    throw error
  }
}

export const syncStore = new SyncStore()
