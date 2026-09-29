import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  isPending,
  type Account,
  type Category,
  type MoneyOperation,
  type Synchronizable,
  type UUID
} from '../model/ledger'
import type { LedgerSnapshot, PullPage, PushResult } from '../model/syncPayloads'
import type { LedgerRepository } from './repository'

interface LedgerDB extends DBSchema {
  accounts: { key: UUID; value: Account }
  categories: { key: UUID; value: Category }
  operations: { key: UUID; value: MoneyOperation }
}

type StoreName = 'accounts' | 'categories' | 'operations'

const databaseName = 'allcash'
const databaseVersion = 1

export class IndexedDBLedgerRepository implements LedgerRepository {
  private database: Promise<IDBPDatabase<LedgerDB>> | null = null

  private open(): Promise<IDBPDatabase<LedgerDB>> {
    this.database ??= openDB<LedgerDB>(databaseName, databaseVersion, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('accounts')) db.createObjectStore('accounts', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('operations')) db.createObjectStore('operations', { keyPath: 'id' })
      }
    })
    return this.database
  }

  async load(): Promise<LedgerSnapshot> {
    const db = await this.open()
    const [accounts, categories, operations] = await Promise.all([
      db.getAll('accounts'),
      db.getAll('categories'),
      db.getAll('operations')
    ])
    return { accounts, categories, operations }
  }

  async addOperation(operation: MoneyOperation): Promise<void> {
    await this.put('operations', operation)
  }

  async updateOperation(operation: MoneyOperation): Promise<void> {
    await this.put('operations', operation)
  }

  async addAccount(account: Account): Promise<void> {
    await this.put('accounts', account)
  }

  async updateAccount(account: Account): Promise<void> {
    await this.put('accounts', account)
  }

  async addCategory(category: Category): Promise<void> {
    await this.put('categories', category)
  }

  async updateCategory(category: Category): Promise<void> {
    await this.put('categories', category)
  }

  async markOperationDeleted(id: UUID, at: string): Promise<void> {
    await this.markDeleted('operations', id, at)
  }

  async markAccountDeleted(id: UUID, at: string): Promise<void> {
    await this.markDeleted('accounts', id, at)
  }

  async markCategoryDeleted(id: UUID, at: string): Promise<void> {
    await this.markDeleted('categories', id, at)
  }

  async setArchived(isArchived: boolean, accountID: UUID): Promise<void> {
    const db = await this.open()
    const stored = await db.get('accounts', accountID)
    if (!stored) return

    await db.put('accounts', { ...stored, isArchived, syncState: { kind: 'pending' } })
  }

  async pendingChanges(): Promise<LedgerSnapshot> {
    const snapshot = await this.load()
    return {
      accounts: snapshot.accounts.filter(isPending),
      categories: snapshot.categories.filter(isPending),
      operations: snapshot.operations
        .filter(isPending)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    }
  }

  async applyPulled(page: PullPage): Promise<void> {
    const db = await this.open()
    const transaction = db.transaction(['accounts', 'categories', 'operations'], 'readwrite')

    await Promise.all([
      ...page.accounts.map((record) => transaction.objectStore('accounts').put(record)),
      ...page.categories.map((record) => transaction.objectStore('categories').put(record)),
      ...page.operations.map((record) => transaction.objectStore('operations').put(record)),
      transaction.done
    ])
  }

  async applyPushResult(result: PushResult): Promise<void> {
    const db = await this.open()
    const transaction = db.transaction(['accounts', 'categories', 'operations'], 'readwrite')

    const stores: StoreName[] = ['accounts', 'categories', 'operations']
    for (const name of stores) {
      const store = transaction.objectStore(name)
      const records = (await store.getAll()) as Synchronizable[]

      for (const record of records) {
        const seq = result.accepted[record.id]
        const reason = result.rejected[record.id]

        if (seq !== undefined) {
          await store.put({ ...record, seq, syncState: { kind: 'synced' } } as never)
        } else if (reason !== undefined) {
          await store.put({ ...record, syncState: { kind: 'failed', reason } } as never)
        }
      }
    }

    await transaction.done
  }

  async eraseAll(): Promise<void> {
    const db = await this.open()
    const transaction = db.transaction(['accounts', 'categories', 'operations'], 'readwrite')
    await Promise.all([
      transaction.objectStore('accounts').clear(),
      transaction.objectStore('categories').clear(),
      transaction.objectStore('operations').clear(),
      transaction.done
    ])
  }

  private async put(name: StoreName, record: Account | Category | MoneyOperation): Promise<void> {
    const db = await this.open()
    await db.put(name, record as never)
  }

  private async markDeleted(name: StoreName, id: UUID, at: string): Promise<void> {
    const db = await this.open()
    const stored = (await db.get(name, id)) as Synchronizable | undefined
    if (!stored) return

    await db.put(name, { ...stored, deletedAt: at, syncState: { kind: 'pending' } } as never)
  }
}
