import type { Account, Category, MoneyOperation, UUID } from '../model/ledger'
import type { LedgerSnapshot, PullPage, PushResult } from '../model/syncPayloads'

export interface LedgerRepository {
  load(): Promise<LedgerSnapshot>

  addOperation(operation: MoneyOperation): Promise<void>
  updateOperation(operation: MoneyOperation): Promise<void>

  addAccount(account: Account): Promise<void>
  updateAccount(account: Account): Promise<void>

  addCategory(category: Category): Promise<void>
  updateCategory(category: Category): Promise<void>

  markOperationDeleted(id: UUID, at: string): Promise<void>
  markAccountDeleted(id: UUID, at: string): Promise<void>
  markCategoryDeleted(id: UUID, at: string): Promise<void>

  setArchived(isArchived: boolean, accountID: UUID): Promise<void>

  pendingChanges(): Promise<LedgerSnapshot>
  applyPulled(page: PullPage): Promise<void>
  applyPushResult(result: PushResult): Promise<void>

  importSnapshot(snapshot: LedgerSnapshot): Promise<void>

  eraseAll(): Promise<void>
}
