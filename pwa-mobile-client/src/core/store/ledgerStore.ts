import { computed, ref, shallowRef, type Ref } from 'vue'
import { correctionCategory, correctionIDs, correctionNames } from '../data/defaultCategories'
import { IndexedDBLedgerRepository } from '../data/idbRepository'
import type { LedgerRepository } from '../data/repository'
import {
  AnalyticsPeriod,
  uncategorizedID,
  uncategorizedName,
  type AnalyticsReport,
  type CategorySpending
} from '../model/analytics'
import { startOfDay } from '../model/dates'
import { add, rounded, sum } from '../model/decimal'
import {
  affectedAccounts,
  balanceEffect,
  categoryApplies,
  isDeleted,
  isPending,
  newUUID,
  pendingState,
  primaryAccount,
  type Account,
  type Category,
  type CategoryKind,
  type DebtOrigin,
  type MoneyOperation,
  type Payload,
  type UUID
} from '../model/ledger'
import { currencyDisplayName, money, type CurrencyCode, type Money } from '../model/money'
import type { PaletteColor } from '../model/palette'
import {
  emptySnapshot,
  isPullPageEmpty,
  isPushResultEmpty,
  type LedgerSnapshot,
  type PullPage,
  type PushResult
} from '../model/syncPayloads'
import {
  makeDayTitle,
  makeDetail,
  makeRowModel,
  type AccountSummary,
  type CurrencyTotal,
  type DebtRepayment,
  type DebtSummary,
  type DebtTranche,
  type OperationDay,
  type OperationDetail
} from './models'

export type LedgerPhase = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class LedgerStore {
  readonly phase: Ref<LedgerPhase> = ref({ kind: 'loading' })
  readonly actionError = ref<string | null>(null)

  readonly days = shallowRef<OperationDay[]>([])
  readonly accounts = shallowRef<AccountSummary[]>([])
  readonly archivedAccounts = shallowRef<AccountSummary[]>([])
  readonly debts = shallowRef<DebtSummary[]>([])
  readonly currencyTotals = shallowRef<CurrencyTotal[]>([])
  readonly counterparties = shallowRef<string[]>([])
  readonly lastUsedAccountID = ref<UUID | null>(null)

  private rawAccounts: Account[] = []
  private categoryList: Category[] = []
  private operations: MoneyOperation[] = []
  private deleted: LedgerSnapshot = emptySnapshot()

  private debtOrigins = new Map<UUID, DebtOrigin>()
  private debtAnchors = new Map<UUID, UUID>()

  private didLoad = false
  private loadTask: Promise<void> | null = null

  private readonly revision = ref(0)

  constructor(private readonly repository: LedgerRepository = new IndexedDBLedgerRepository()) {}

  readonly hasOperations = computed(() => {
    void this.revision.value
    return this.operations.length > 0
  })

  readonly hasAccounts = computed(() => {
    void this.revision.value
    return this.rawAccounts.length > 0
  })

  readonly owedToUser = computed(() =>
    this.debts.value.filter((debt) => debt.direction === 'given' && debt.outstanding.amount > 0)
  )

  readonly owedByUser = computed(() =>
    this.debts.value.filter((debt) => debt.direction === 'taken' && debt.outstanding.amount > 0)
  )

  readonly allCategories = computed(() => {
    void this.revision.value
    return [...this.categoryList].sort((left, right) => left.name.localeCompare(right.name, 'ru'))
  })

  readonly pendingCount = computed(() => {
    const snapshot = this.pendingChanges()
    return snapshot.accounts.length + snapshot.categories.length + snapshot.operations.length
  })

  readonly analyticsCurrencies = computed(() => {
    void this.revision.value
    const seen = new Set<CurrencyCode>()
    for (const account of this.rawAccounts) seen.add(account.currency)
    return [...seen].sort()
  })

  readonly operationDateRange = computed<{ from: Date; to: Date } | null>(() => {
    void this.revision.value
    if (this.operations.length === 0) return null

    const times = this.operations.map((operation) => new Date(operation.date).getTime())
    return { from: new Date(Math.min(...times)), to: new Date(Math.max(...times)) }
  })

  readonly suggestedAccountID = computed<UUID | null>(() => {
    void this.revision.value
    const last = this.lastUsedAccountID.value
    if (last && this.rawAccounts.some((account) => account.id === last && !account.isArchived)) return last
    return this.selectableAccounts()[0]?.id ?? null
  })

  debt(id: UUID): DebtSummary | null {
    const anchor = this.debtAnchors.get(id) ?? id
    return this.debts.value.find((item) => item.id === anchor) ?? null
  }

  minimumPrincipal(operationID: UUID): Money | null {
    const debt = this.debt(operationID)
    if (!debt || debt.repayments.length === 0) return null

    const tranche = debt.tranches.find((item) => item.id === operationID)
    if (!tranche) return null

    const repaid = sum(debt.repayments.map((item) => item.amount.amount))
    const others = add(debt.principal.amount, -tranche.amount.amount)
    return money(Math.max(add(repaid, -others), 0), debt.principal.currency)
  }

  operationDetail(id: UUID): OperationDetail | null {
    void this.revision.value
    const operation = this.operations.find((item) => item.id === id)
    if (!operation) return null

    return makeDetail(operation, this.categoryIndex(), this.accountIndex(), this.debtOriginOf(operation))
  }

  operation(id: UUID): MoneyOperation | null {
    void this.revision.value
    return this.operations.find((item) => item.id === id) ?? null
  }

  selectableAccounts(currency: CurrencyCode | null = null): Account[] {
    void this.revision.value
    return this.rawAccounts.filter(
      (account) => !account.isArchived && (currency === null || account.currency === currency)
    )
  }

  accountNames(excluding: UUID | null = null): string[] {
    return this.rawAccounts.filter((account) => account.id !== excluding).map((account) => account.name)
  }

  accountSummary(id: UUID): AccountSummary | null {
    return (
      this.accounts.value.find((account) => account.id === id) ??
      this.archivedAccounts.value.find((account) => account.id === id) ??
      null
    )
  }

  hasOperationsFor(accountID: UUID): boolean {
    void this.revision.value
    return this.operations.some((operation) => affectedAccounts(operation).includes(accountID))
  }

  account(id: UUID | null | undefined): Account | null {
    void this.revision.value
    if (!id) return null
    return this.rawAccounts.find((account) => account.id === id) ?? null
  }

  availableCategories(kind: CategoryKind): Category[] {
    void this.revision.value
    return this.categoryList
      .filter((category) => categoryApplies(category, kind))
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'))
  }

  category(id: UUID | null | undefined): Category | null {
    void this.revision.value
    if (!id) return null
    return this.categoryList.find((category) => category.id === id) ?? null
  }

  categoryNames(kind: CategoryKind, excluding: UUID | null = null): string[] {
    return this.categoryList
      .filter((category) => categoryApplies(category, kind) && category.id !== excluding)
      .map((category) => category.name)
  }

  counterpartySuggestions(query: string, limit = 3): string[] {
    const needle = query.trim().toLowerCase()
    if (needle.length === 0) return []

    return this.counterparties.value
      .filter((name) => name.toLowerCase().startsWith(needle) && name.toLowerCase() !== needle)
      .slice(0, limit)
  }

  repaymentCount(operationID: UUID): number {
    const operation = this.operations.find((item) => item.id === operationID)
    if (!operation || operation.payload.kind !== 'debt') return 0
    return this.repaymentsOf(operationID).length
  }

  async loadIfNeeded(): Promise<void> {
    if (this.didLoad) return
    if (this.loadTask) return this.loadTask

    this.loadTask = this.load()
    await this.loadTask
    this.loadTask = null
  }

  async load(): Promise<void> {
    this.phase.value = { kind: 'loading' }

    try {
      const snapshot = await this.repository.load()

      this.rawAccounts = snapshot.accounts.filter((record) => !isDeleted(record))
      this.categoryList = snapshot.categories.filter((record) => !isDeleted(record))
      this.operations = snapshot.operations.filter((record) => !isDeleted(record))

      this.deleted = {
        accounts: snapshot.accounts.filter(isDeleted),
        categories: snapshot.categories.filter(isDeleted),
        operations: snapshot.operations.filter(isDeleted)
      }

      this.didLoad = true
      this.rebuild()
      this.phase.value = { kind: 'ready' }
    } catch (error) {
      this.phase.value = { kind: 'failed', message: errorMessage(error) }
    }
  }

  async eraseAll(): Promise<void> {
    try {
      await this.repository.eraseAll()
    } catch (error) {
      this.actionError.value = errorMessage(error)
      return
    }

    this.rawAccounts = []
    this.categoryList = []
    this.operations = []
    this.deleted = emptySnapshot()
    this.didLoad = true
    this.rebuild()
    this.phase.value = { kind: 'ready' }
  }

  refreshDayTitles(): void {
    if (!this.didLoad) return
    this.rebuild()
  }

  async deleteOperation(operationID: UUID): Promise<void> {
    const target = this.operations.find((item) => item.id === operationID)
    if (!target) return

    const doomed = new Set<UUID>([operationID])
    if (target.payload.kind === 'debt') {
      for (const repayment of this.repaymentsOf(operationID)) doomed.add(repayment.id)
    }

    const date = new Date().toISOString()
    const previousLive = this.operations
    const previousDeleted = this.deleted.operations

    const removed = this.operations
      .filter((operation) => doomed.has(operation.id))
      .map((operation) => ({ ...operation, deletedAt: date, syncState: pendingState }))

    this.operations = this.operations.filter((operation) => !doomed.has(operation.id))
    this.deleted.operations = [...this.deleted.operations, ...removed]
    this.rebuild()

    try {
      for (const id of doomed) await this.repository.markOperationDeleted(id, date)
    } catch (error) {
      this.operations = previousLive
      this.deleted.operations = previousDeleted
      this.rebuild()
      this.actionError.value = errorMessage(error)
    }
  }

  async update(operationID: UUID, date: string, note: string | null, payload: Payload): Promise<boolean> {
    const index = this.operations.findIndex((item) => item.id === operationID)
    if (index < 0) return false

    const updated: MoneyOperation = {
      ...this.operations[index]!,
      date,
      note: LedgerStore.normalized(note),
      payload,
      syncState: pendingState
    }

    const previous = this.operations
    this.operations = this.operations.map((item, position) => (position === index ? updated : item))
    this.rebuild()

    try {
      await this.repository.updateOperation(updated)
      return true
    } catch (error) {
      this.operations = previous
      this.rebuild()
      this.actionError.value = errorMessage(error)
      return false
    }
  }

  async record(date: string, note: string | null, payload: Payload): Promise<boolean> {
    const operation: MoneyOperation = {
      id: newUUID(),
      date,
      createdAt: new Date().toISOString(),
      note: LedgerStore.normalized(note),
      syncState: pendingState,
      deletedAt: null,
      seq: null,
      payload
    }

    const previous = this.operations
    this.operations = [...this.operations, operation]
    this.rebuild()

    try {
      await this.repository.addOperation(operation)
      return true
    } catch (error) {
      this.operations = previous
      this.rebuild()
      this.actionError.value = errorMessage(error)
      return false
    }
  }

  pendingChanges(): LedgerSnapshot {
    void this.revision.value
    return {
      accounts: [...this.rawAccounts, ...this.deleted.accounts].filter(isPending),
      categories: [...this.categoryList, ...this.deleted.categories].filter(isPending),
      operations: [...this.operations, ...this.deleted.operations]
        .filter(isPending)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    }
  }

  async applyPulled(incoming: PullPage): Promise<void> {
    const page = this.preservingLocalKinds(incoming)
    if (isPullPageEmpty(page)) return

    const previousLive = {
      accounts: this.rawAccounts,
      categories: this.categoryList,
      operations: this.operations
    }
    const previousDeleted = { ...this.deleted }

    const accounts = LedgerStore.merge(page.accounts, this.rawAccounts, this.deleted.accounts)
    const categories = LedgerStore.merge(page.categories, this.categoryList, this.deleted.categories)
    const operations = LedgerStore.merge(page.operations, this.operations, this.deleted.operations)

    this.rawAccounts = accounts.live
    this.deleted.accounts = accounts.deleted
    this.categoryList = categories.live
    this.deleted.categories = categories.deleted
    this.operations = operations.live
    this.deleted.operations = operations.deleted
    this.rebuild()

    try {
      await this.repository.applyPulled(page)
    } catch (error) {
      this.rawAccounts = previousLive.accounts
      this.categoryList = previousLive.categories
      this.operations = previousLive.operations
      this.deleted = previousDeleted
      this.rebuild()
      this.actionError.value = errorMessage(error)
    }
  }

  async applyPushResult(result: PushResult): Promise<void> {
    if (isPushResultEmpty(result)) return

    const previousLive = {
      accounts: this.rawAccounts,
      categories: this.categoryList,
      operations: this.operations
    }
    const previousDeleted = { ...this.deleted }

    this.rawAccounts = LedgerStore.applyResult(result, this.rawAccounts)
    this.categoryList = LedgerStore.applyResult(result, this.categoryList)
    this.operations = LedgerStore.applyResult(result, this.operations)
    this.deleted = {
      accounts: LedgerStore.applyResult(result, this.deleted.accounts),
      categories: LedgerStore.applyResult(result, this.deleted.categories),
      operations: LedgerStore.applyResult(result, this.deleted.operations)
    }
    this.rebuild()

    try {
      await this.repository.applyPushResult(result)
    } catch (error) {
      this.rawAccounts = previousLive.accounts
      this.categoryList = previousLive.categories
      this.operations = previousLive.operations
      this.deleted = previousDeleted
      this.rebuild()
      this.actionError.value = errorMessage(error)
    }
  }

  private preservingLocalKinds(page: PullPage): PullPage {
    if (page.categories.length === 0) return page

    return {
      ...page,
      categories: page.categories.map((incoming) => {
        const local =
          this.categoryList.find((item) => item.id === incoming.id) ??
          this.deleted.categories.find((item) => item.id === incoming.id)

        if (!local || local.kinds.length <= 1) return incoming
        const isSuperset = incoming.kinds.every((kind) => local.kinds.includes(kind))
        return isSuperset ? { ...incoming, kinds: local.kinds } : incoming
      })
    }
  }

  private static merge<T extends { id: UUID; deletedAt: string | null; syncState: { kind: string } }>(
    incoming: T[],
    live: T[],
    deleted: T[]
  ): { live: T[]; deleted: T[] } {
    let nextLive = [...live]
    let nextDeleted = [...deleted]

    for (const record of incoming) {
      const liveIndex = nextLive.findIndex((item) => item.id === record.id)
      if (liveIndex >= 0) {
        if (nextLive[liveIndex]!.syncState.kind !== 'synced') continue
        nextLive.splice(liveIndex, 1)
      } else {
        const deletedIndex = nextDeleted.findIndex((item) => item.id === record.id)
        if (deletedIndex >= 0) {
          if (nextDeleted[deletedIndex]!.syncState.kind !== 'synced') continue
          nextDeleted.splice(deletedIndex, 1)
        }
      }

      if (record.deletedAt !== null) nextDeleted = [...nextDeleted, record]
      else nextLive = [...nextLive, record]
    }

    return { live: nextLive, deleted: nextDeleted }
  }

  private static applyResult<T extends { id: UUID; seq: number | null; syncState: unknown }>(
    result: PushResult,
    records: T[]
  ): T[] {
    return records.map((record) => {
      const seq = result.accepted[record.id]
      if (seq !== undefined) return { ...record, seq, syncState: { kind: 'synced' } }

      const reason = result.rejected[record.id]
      if (reason !== undefined) return { ...record, syncState: { kind: 'failed', reason } }

      return record
    })
  }

  async createCategory(
    name: string,
    kinds: CategoryKind[],
    symbolName: string,
    color: PaletteColor
  ): Promise<Category | null> {
    const category: Category = {
      id: newUUID(),
      name: name.trim(),
      kinds: [...kinds],
      symbolName,
      color,
      syncState: pendingState,
      deletedAt: null,
      seq: null
    }

    const previous = this.categoryList
    this.categoryList = [...this.categoryList, category]
    this.rebuild()

    try {
      await this.repository.addCategory(category)
      return category
    } catch (error) {
      this.categoryList = previous
      this.rebuild()
      this.actionError.value = errorMessage(error)
      return null
    }
  }

  async updateCategory(
    categoryID: UUID,
    name: string,
    kinds: CategoryKind[],
    symbolName: string,
    color: PaletteColor
  ): Promise<Category | null> {
    const index = this.categoryList.findIndex((item) => item.id === categoryID)
    if (index < 0) return null

    const updated: Category = {
      ...this.categoryList[index]!,
      name: name.trim(),
      kinds: [...kinds],
      symbolName,
      color,
      syncState: pendingState
    }

    const previous = this.categoryList
    this.categoryList = this.categoryList.map((item, position) => (position === index ? updated : item))
    this.rebuild()

    try {
      await this.repository.updateCategory(updated)
      return updated
    } catch (error) {
      this.categoryList = previous
      this.rebuild()
      this.actionError.value = errorMessage(error)
      return null
    }
  }

  async deleteCategory(categoryID: UUID): Promise<boolean> {
    const target = this.categoryList.find((item) => item.id === categoryID)
    if (!target) return false

    const date = new Date().toISOString()
    const previousLive = this.categoryList
    const previousDeleted = this.deleted.categories

    this.categoryList = this.categoryList.filter((item) => item.id !== categoryID)
    this.deleted.categories = [...this.deleted.categories, { ...target, deletedAt: date, syncState: pendingState }]
    this.rebuild()

    try {
      await this.repository.markCategoryDeleted(categoryID, date)
      return true
    } catch (error) {
      this.categoryList = previousLive
      this.deleted.categories = previousDeleted
      this.rebuild()
      this.actionError.value = errorMessage(error)
      return false
    }
  }

  async createAccount(
    name: string,
    currency: CurrencyCode,
    initialBalance: number,
    isHidden = false
  ): Promise<void> {
    const account: Account = {
      id: newUUID(),
      name: name.trim(),
      currency,
      initialBalance: rounded(initialBalance),
      isArchived: false,
      isHidden,
      syncState: pendingState,
      deletedAt: null,
      seq: null
    }

    const previous = this.rawAccounts
    this.rawAccounts = [...this.rawAccounts, account]
    this.rebuild()

    try {
      await this.repository.addAccount(account)
    } catch (error) {
      this.rawAccounts = previous
      this.rebuild()
      this.actionError.value = errorMessage(error)
    }
  }

  async updateAccount(
    accountID: UUID,
    name: string,
    currency: CurrencyCode,
    initialBalance: number,
    isHidden: boolean
  ): Promise<Account | null> {
    const index = this.rawAccounts.findIndex((item) => item.id === accountID)
    if (index < 0) return null

    const updated: Account = {
      ...this.rawAccounts[index]!,
      name: name.trim(),
      currency,
      initialBalance: rounded(initialBalance),
      isHidden,
      syncState: pendingState
    }

    const previous = this.rawAccounts
    this.rawAccounts = this.rawAccounts.map((item, position) => (position === index ? updated : item))
    this.rebuild()

    try {
      await this.repository.updateAccount(updated)
      return updated
    } catch (error) {
      this.rawAccounts = previous
      this.rebuild()
      this.actionError.value = errorMessage(error)
      return null
    }
  }

  async setArchived(isArchived: boolean, accountID: UUID): Promise<void> {
    const index = this.rawAccounts.findIndex((item) => item.id === accountID)
    if (index < 0) return

    const previous = this.rawAccounts
    this.rawAccounts = this.rawAccounts.map((item, position) =>
      position === index ? { ...item, isArchived, syncState: pendingState } : item
    )
    this.rebuild()

    try {
      await this.repository.setArchived(isArchived, accountID)
    } catch (error) {
      this.rawAccounts = previous
      this.rebuild()
      this.actionError.value = errorMessage(error)
    }
  }

  private static findCorrection(categories: Category[], kind: CategoryKind): Category | null {
    return (
      categories.find((category) => category.id === correctionIDs[kind]) ??
      categories.find(
        (category) =>
          categoryApplies(category, kind) &&
          correctionNames.some((name) => category.name.toLowerCase() === name.toLowerCase())
      ) ??
      null
    )
  }

  async correctBalance(accountID: UUID, target: number, date: string = new Date().toISOString()): Promise<boolean> {
    const account = this.account(accountID)
    const summary = this.accountSummary(accountID)
    if (!account || !summary) return false

    const delta = add(rounded(target), -summary.balance)
    if (delta === 0) return true

    const kind: CategoryKind = delta > 0 ? 'income' : 'expense'
    const category = await this.correctionCategoryForWriting(kind)
    if (!category) return false

    const amount = money(Math.abs(delta), account.currency)
    const payload: Payload = { kind, category: category.id, account: accountID, amount }

    return this.record(date, 'Правка суммы счёта', payload)
  }

  private async correctionCategoryForWriting(kind: CategoryKind): Promise<Category | null> {
    const existing = LedgerStore.findCorrection(this.categoryList, kind)
    if (existing) return existing

    const restorable = LedgerStore.findCorrection(this.deleted.categories, kind)
    if (restorable) return this.restoreCategory(restorable)

    const category = correctionCategory(kind)
    const previous = this.categoryList
    this.categoryList = [...this.categoryList, category]
    this.rebuild()

    try {
      await this.repository.addCategory(category)
      return category
    } catch (error) {
      this.categoryList = previous
      this.rebuild()
      this.actionError.value = errorMessage(error)
      return null
    }
  }

  private async restoreCategory(category: Category): Promise<Category | null> {
    const revived: Category = { ...category, deletedAt: null, syncState: pendingState }

    const previousLive = this.categoryList
    const previousDeleted = this.deleted.categories
    this.categoryList = [...this.categoryList, revived]
    this.deleted.categories = this.deleted.categories.filter((item) => item.id !== revived.id)
    this.rebuild()

    try {
      await this.repository.updateCategory(revived)
      return revived
    } catch (error) {
      this.categoryList = previousLive
      this.deleted.categories = previousDeleted
      this.rebuild()
      this.actionError.value = errorMessage(error)
      return null
    }
  }

  async repay(debt: DebtSummary, amount: number, account: Account, date: string): Promise<void> {
    const operation: MoneyOperation = {
      id: newUUID(),
      date,
      createdAt: new Date().toISOString(),
      note: null,
      syncState: pendingState,
      deletedAt: null,
      seq: null,
      payload: {
        kind: 'repayment',
        debt: debt.id,
        account: account.id,
        amount: money(rounded(amount), debt.outstanding.currency)
      }
    }

    const previous = this.operations
    this.operations = [...this.operations, operation]
    this.rebuild()

    try {
      await this.repository.addOperation(operation)
    } catch (error) {
      this.operations = previous
      this.rebuild()
      this.actionError.value = errorMessage(error)
    }
  }

  expenseReport(period: AnalyticsPeriod, currency: CurrencyCode): AnalyticsReport {
    void this.revision.value
    const categories = this.categoryIndex()

    const sums = new Map<UUID, number>()
    const counts = new Map<UUID, number>()
    let total = 0

    for (const operation of this.operations) {
      const payload = operation.payload
      if (payload.kind !== 'expense') continue
      if (payload.amount.currency !== currency) continue
      if (!period.contains(new Date(operation.date))) continue

      const key = categories.has(payload.category) ? payload.category : uncategorizedID
      sums.set(key, add(sums.get(key) ?? 0, payload.amount.amount))
      counts.set(key, (counts.get(key) ?? 0) + 1)
      total = add(total, payload.amount.amount)
    }

    const spendings: CategorySpending[] = []
    for (const [categoryID, value] of sums) {
      const category = categories.get(categoryID)
      spendings.push({
        id: categoryID,
        name: category?.name ?? uncategorizedName,
        symbolName: category?.symbolName ?? 'questionmark.circle',
        color: category?.color ?? 'graphite',
        total: { amount: value, currency },
        share: total > 0 ? value / total : 0,
        operationCount: counts.get(categoryID) ?? 0
      })
    }

    spendings.sort((left, right) => {
      if (left.total.amount === right.total.amount) return left.name.localeCompare(right.name, 'ru')
      return right.total.amount - left.total.amount
    })

    return { period, currency, categories: spendings, total: { amount: total, currency } }
  }

  expenseDays(categoryID: UUID, period: AnalyticsPeriod, currency: CurrencyCode): OperationDay[] {
    void this.revision.value
    const known = this.categoryList.some((category) => category.id === categoryID)

    const matching = this.sortedOperations().filter((operation) => {
      const payload = operation.payload
      if (payload.kind !== 'expense') return false
      if (payload.amount.currency !== currency) return false
      if (!period.contains(new Date(operation.date))) return false

      if (known) return payload.category === categoryID
      return (
        categoryID === uncategorizedID && !this.categoryList.some((category) => category.id === payload.category)
      )
    })

    return this.makeDays(matching)
  }

  private repaymentsOf(debtID: UUID): MoneyOperation[] {
    return this.operations.filter(
      (operation) => operation.payload.kind === 'repayment' && operation.payload.debt === debtID
    )
  }

  private static normalized(note: string | null | undefined): string | null {
    const trimmed = note?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : null
  }

  private categoryIndex(): Map<UUID, Category> {
    return new Map(this.categoryList.map((category) => [category.id, category]))
  }

  private accountIndex(): Map<UUID, Account> {
    return new Map(this.rawAccounts.map((account) => [account.id, account]))
  }

  private debtOriginOf(operation: MoneyOperation): DebtOrigin | null {
    if (operation.payload.kind !== 'repayment') return null
    return this.debtOrigins.get(operation.payload.debt) ?? null
  }

  private sortedOperations(): MoneyOperation[] {
    return [...this.operations].sort((left, right) => {
      if (left.date === right.date) return right.createdAt.localeCompare(left.createdAt)
      return right.date.localeCompare(left.date)
    })
  }

  private rebuild(): void {
    this.debtOrigins = new Map()
    for (const operation of this.operations) {
      if (operation.payload.kind === 'debt') {
        this.debtOrigins.set(operation.id, {
          direction: operation.payload.direction,
          counterparty: operation.payload.counterparty
        })
      }
    }

    this.rebuildDays()
    this.rebuildAccounts()
    this.rebuildDebts()
    this.rebuildSuggestions()
    this.revision.value += 1
  }

  private rebuildSuggestions(): void {
    this.lastUsedAccountID.value =
      [...this.operations]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(primaryAccount)
        .find((id) => this.rawAccounts.some((account) => account.id === id && !account.isArchived)) ?? null

    const seen = new Set<string>()
    const names: string[] = []
    for (const operation of this.sortedOperations()) {
      if (operation.payload.kind !== 'debt') continue
      const name = operation.payload.counterparty.trim()
      if (name.length === 0) continue
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      names.push(name)
    }
    this.counterparties.value = names
  }

  private rebuildDays(): void {
    this.days.value = this.makeDays(this.sortedOperations())
  }

  private makeDays(operations: MoneyOperation[]): OperationDay[] {
    const categories = this.categoryIndex()
    const accounts = this.accountIndex()

    const groups = new Map<number, MoneyOperation[]>()
    for (const operation of operations) {
      const key = startOfDay(new Date(operation.date)).getTime()
      const bucket = groups.get(key)
      if (bucket) bucket.push(operation)
      else groups.set(key, [operation])
    }

    return [...groups.entries()]
      .sort((left, right) => right[0] - left[0])
      .map(([day, dayOperations]) => ({
        id: day,
        title: makeDayTitle(new Date(day)),
        rows: dayOperations.map((operation) =>
          makeRowModel(operation, categories, accounts, this.debtOriginOf(operation))
        )
      }))
  }

  private rebuildAccounts(): void {
    const balances = new Map<UUID, number>()
    for (const account of this.rawAccounts) balances.set(account.id, account.initialBalance)

    for (const operation of this.operations) {
      for (const accountID of affectedAccounts(operation)) {
        const current = balances.get(accountID)
        if (current === undefined) continue
        balances.set(accountID, add(current, balanceEffect(operation, accountID, this.debtOriginOf(operation))))
      }
    }

    const summaries: AccountSummary[] = this.rawAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      currencyName: currencyDisplayName(account.currency),
      balance: balances.get(account.id) ?? account.initialBalance,
      isArchived: account.isArchived,
      isHidden: account.isHidden
    }))

    this.accounts.value = summaries.filter((account) => !account.isArchived)
    this.archivedAccounts.value = summaries.filter((account) => account.isArchived)

    const totals = new Map<CurrencyCode, number>()
    for (const account of this.accounts.value) {
      totals.set(account.currency, add(totals.get(account.currency) ?? 0, account.balance))
    }

    this.currencyTotals.value = [...totals.entries()]
      .map(([currency, total]) => ({ currency, total, currencyName: currencyDisplayName(currency) }))
      .sort((left, right) => left.currency.localeCompare(right.currency))
  }

  private rebuildDebts(): void {
    const accountNames = new Map(this.rawAccounts.map((account) => [account.id, account.name]))

    const order: string[] = []
    const grouped = new Map<string, MoneyOperation[]>()
    const keyInfo = new Map<string, { direction: 'given' | 'taken'; currency: CurrencyCode }>()

    for (const operation of this.sortedOperations()) {
      const payload = operation.payload
      if (payload.kind !== 'debt') continue

      const key = [payload.direction, payload.counterparty.trim().toLowerCase(), payload.amount.currency].join('|')
      if (!grouped.has(key)) {
        order.push(key)
        grouped.set(key, [])
        keyInfo.set(key, { direction: payload.direction, currency: payload.amount.currency })
      }
      grouped.get(key)!.push(operation)
    }

    const anchors = new Map<UUID, string>()
    for (const [key, operations] of grouped) {
      for (const operation of operations) anchors.set(operation.id, key)
    }

    const repayments = new Map<string, DebtRepayment[]>()
    for (const operation of this.sortedOperations()) {
      const payload = operation.payload
      if (payload.kind !== 'repayment') continue

      const key = anchors.get(payload.debt)
      if (!key) continue

      const bucket = repayments.get(key) ?? []
      bucket.push({
        id: operation.id,
        date: operation.date,
        amount: payload.amount,
        accountName: accountNames.get(payload.account) ?? 'Счёт',
        syncState: operation.syncState
      })
      repayments.set(key, bucket)
    }

    this.debtAnchors = new Map()

    const debts: DebtSummary[] = []
    for (const key of order) {
      const operations = grouped.get(key)
      const info = keyInfo.get(key)
      if (!operations || operations.length === 0 || !info) continue

      const newest = operations[0]!
      const oldest = operations[operations.length - 1]!
      if (newest.payload.kind !== 'debt') continue

      const tranches: DebtTranche[] = operations.flatMap((operation) => {
        const payload = operation.payload
        if (payload.kind !== 'debt') return []
        return [
          {
            id: operation.id,
            date: operation.date,
            amount: payload.amount,
            accountName: accountNames.get(payload.account) ?? 'Счёт',
            syncState: operation.syncState
          }
        ]
      })

      for (const operation of operations) this.debtAnchors.set(operation.id, oldest.id)

      const principal = sum(tranches.map((tranche) => tranche.amount.amount))
      const history = repayments.get(key) ?? []
      const repaid = sum(history.map((item) => item.amount.amount))

      debts.push({
        id: oldest.id,
        direction: info.direction,
        counterparty: newest.payload.counterparty.trim(),
        principal: money(principal, info.currency),
        outstanding: money(Math.max(add(principal, -repaid), 0), info.currency),
        openedAt: oldest.date,
        accountName: tranches[0]?.accountName ?? 'Счёт',
        tranches,
        repayments: history
      })
    }

    this.debts.value = debts
  }
}

export const ledgerStore = new LedgerStore()
