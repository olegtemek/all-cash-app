import { entriesWording } from '../model/analytics'
import { dayTitle, fullDate } from '../model/dates'
import {
  syncSpokenNote,
  type Account,
  type Category,
  type CategoryKind,
  type DebtDirection,
  type DebtOrigin,
  type MoneyOperation,
  type SyncState,
  type UUID
} from '../model/ledger'
import {
  currencyDisplayName,
  formatBalance,
  formatMoney,
  spokenBalance,
  spokenMoney,
  type CurrencyCode,
  type Direction,
  type Money
} from '../model/money'
import type { PaletteColor } from '../model/palette'

export interface AccountSummary {
  id: UUID
  name: string
  currency: CurrencyCode
  currencyName: string
  balance: number
  isArchived: boolean
  isHidden: boolean
}

export const hiddenBalanceTitle = '••••'

export function accountBalanceTitle(account: AccountSummary): string {
  return account.isHidden ? hiddenBalanceTitle : formatBalance(account.balance, account.currency)
}

export function accountAccessibilityLabel(account: AccountSummary): string {
  if (account.isHidden) return `${account.name}, ${account.currencyName}, баланс скрыт`
  return `${account.name}, ${account.currencyName}, баланс ${spokenBalance(account.balance, account.currency)}`
}

export interface DebtTranche {
  id: UUID
  date: string
  amount: Money
  accountName: string
  syncState: SyncState
}

export interface DebtRepayment extends DebtTranche {}

export interface DebtSummary {
  id: UUID
  direction: DebtDirection
  counterparty: string
  principal: Money
  outstanding: Money
  openedAt: string
  accountName: string
  tranches: DebtTranche[]
  repayments: DebtRepayment[]
}

export function isDebtClosed(debt: DebtSummary): boolean {
  return debt.outstanding.amount <= 0
}

export function isDebtAggregated(debt: DebtSummary): boolean {
  return debt.tranches.length > 1
}

export function debtDirectionTitle(direction: DebtDirection): string {
  return direction === 'given' ? 'Мне должны' : 'Я должен'
}

export function debtStateTitle(debt: DebtSummary): string {
  const state = isDebtClosed(debt) ? 'Закрыт' : debt.repayments.length === 0 ? 'Открыт' : 'Частично погашен'
  if (!isDebtAggregated(debt)) return state
  return `${state} · ${entriesWording(debt.tranches.length)}`
}

export interface CurrencyTotal {
  currency: CurrencyCode
  total: number
  currencyName: string
}

export interface RowAmount {
  text: string
  spoken: string
  direction: Direction
}

function rowAmount(value: Money, direction: Direction): RowAmount {
  return { text: formatMoney(value, direction), spoken: spokenMoney(value, direction), direction }
}

export interface OperationRowModel {
  id: UUID
  symbolName: string
  tint: PaletteColor
  typeLabel: string
  title: string
  subtitle: string | null
  amounts: RowAmount[]
  syncState: SyncState
  isEditable: boolean
}

export function isTransferRow(row: { amounts: RowAmount[] }): boolean {
  return row.amounts.length > 1
}

function joined(...parts: (string | null | undefined)[]): string | null {
  const cleaned = parts.map((part) => part?.trim()).filter((part): part is string => !!part && part.length > 0)
  return cleaned.length === 0 ? null : cleaned.join(' · ')
}

export function rowAccessibilityLabel(row: OperationRowModel): string {
  const parts = [row.typeLabel, row.title]
  if (row.subtitle) parts.push(row.subtitle)
  parts.push(...row.amounts.map((amount) => amount.spoken))

  const note = syncSpokenNote(row.syncState)
  if (note) parts.push(note)
  return parts.join(', ')
}

export function makeRowModel(
  operation: MoneyOperation,
  categories: Map<UUID, Category>,
  accounts: Map<UUID, Account>,
  debtOrigin: DebtOrigin | null
): OperationRowModel {
  const payload = operation.payload
  const base = { id: operation.id, syncState: operation.syncState }

  switch (payload.kind) {
    case 'expense':
    case 'income': {
      const category = categories.get(payload.category)
      const isExpense = payload.kind === 'expense'
      return {
        ...base,
        symbolName: category?.symbolName ?? 'questionmark.circle',
        tint: category?.color ?? 'graphite',
        typeLabel: isExpense ? 'Расход' : 'Доход',
        title: category?.name ?? 'Без категории',
        subtitle: operation.note,
        amounts: [rowAmount(payload.amount, isExpense ? 'outgoing' : 'incoming')],
        isEditable: true
      }
    }

    case 'debt': {
      const isGiven = payload.direction === 'given'
      return {
        ...base,
        symbolName: isGiven ? 'person.crop.circle.badge.minus' : 'person.crop.circle.badge.plus',
        tint: isGiven ? 'orange' : 'blue',
        typeLabel: 'Долг',
        title: isGiven ? 'Дал в долг' : 'Взял в долг',
        subtitle: joined(payload.counterparty, operation.note),
        amounts: [rowAmount(payload.amount, isGiven ? 'outgoing' : 'incoming')],
        isEditable: true
      }
    }

    case 'repayment': {
      const isGiven = debtOrigin?.direction === 'given'
      return {
        ...base,
        symbolName: 'arrow.uturn.backward.circle.fill',
        tint: isGiven ? 'green' : 'orange',
        typeLabel: 'Погашение долга',
        title: isGiven ? 'Вернули долг' : 'Вернул долг',
        subtitle: joined(debtOrigin?.counterparty, operation.note),
        amounts: [rowAmount(payload.amount, isGiven ? 'incoming' : 'outgoing')],
        isEditable: false
      }
    }

    case 'transfer': {
      const route = `${accounts.get(payload.from)?.name ?? 'Счёт'} → ${accounts.get(payload.to)?.name ?? 'Счёт'}`
      return {
        ...base,
        symbolName: 'arrow.left.arrow.right.circle.fill',
        tint: 'graphite',
        typeLabel: 'Перевод',
        title: 'Перевод',
        subtitle: joined(route, operation.note),
        amounts: [rowAmount(payload.spent, 'outgoing'), rowAmount(payload.received, 'incoming')],
        isEditable: true
      }
    }
  }
}

export interface DetailAmount extends RowAmount {
  label: string | null
}

export interface DetailField {
  title: string
  value: string
  symbolName: string
}

export interface OperationDetail {
  id: UUID
  symbolName: string
  tint: PaletteColor
  typeLabel: string
  title: string
  amounts: DetailAmount[]
  fields: DetailField[]
  note: string | null
  syncState: SyncState
  debtID: UUID | null
  isEditable: boolean
}

export function detailSyncTitle(state: SyncState): string {
  switch (state.kind) {
    case 'pending':
      return 'Не выгружено'
    case 'synced':
      return 'Выгружено'
    case 'failed':
      return `Ошибка выгрузки: ${state.reason}`
  }
}

export function detailAccessibilityLabel(detail: OperationDetail): string {
  const parts = [detail.typeLabel, detail.title]
  parts.push(...detail.amounts.map((amount) => (amount.label ? `${amount.label}: ${amount.spoken}` : amount.spoken)))
  return parts.join(', ')
}

function accountField(account: Account | undefined, title = 'Счёт'): DetailField {
  return { title, value: account?.name ?? 'Счёт удалён', symbolName: 'creditcard' }
}

function detailAmount(value: Money, direction: Direction, label: string | null = null): DetailAmount {
  return { ...rowAmount(value, direction), label }
}

export function makeDetail(
  operation: MoneyOperation,
  categories: Map<UUID, Category>,
  accounts: Map<UUID, Account>,
  debtOrigin: DebtOrigin | null
): OperationDetail {
  const dateField: DetailField = { title: 'Дата', value: fullDate(new Date(operation.date)), symbolName: 'calendar' }
  const base = { id: operation.id, syncState: operation.syncState, note: operation.note }
  const payload = operation.payload

  switch (payload.kind) {
    case 'expense':
    case 'income': {
      const category = categories.get(payload.category)
      const isExpense = payload.kind === 'expense'
      const title = category?.name ?? 'Без категории'
      return {
        ...base,
        symbolName: category?.symbolName ?? 'questionmark.circle',
        tint: category?.color ?? 'graphite',
        typeLabel: isExpense ? 'Расход' : 'Доход',
        title,
        amounts: [detailAmount(payload.amount, isExpense ? 'outgoing' : 'incoming')],
        debtID: null,
        isEditable: true,
        fields: [
          { title: 'Категория', value: title, symbolName: 'square.grid.2x2' },
          accountField(accounts.get(payload.account)),
          dateField
        ]
      }
    }

    case 'debt': {
      const isGiven = payload.direction === 'given'
      const title = isGiven ? 'Дал в долг' : 'Взял в долг'
      return {
        ...base,
        symbolName: isGiven ? 'person.crop.circle.badge.minus' : 'person.crop.circle.badge.plus',
        tint: isGiven ? 'orange' : 'blue',
        typeLabel: 'Долг',
        title,
        amounts: [detailAmount(payload.amount, isGiven ? 'outgoing' : 'incoming')],
        debtID: operation.id,
        isEditable: true,
        fields: [
          { title: 'Направление', value: title, symbolName: 'arrow.left.arrow.right' },
          { title: 'Контрагент', value: payload.counterparty, symbolName: 'person' },
          accountField(accounts.get(payload.account)),
          dateField
        ]
      }
    }

    case 'repayment': {
      const isGiven = debtOrigin?.direction === 'given'
      const title = isGiven ? 'Вернули долг' : 'Вернул долг'
      return {
        ...base,
        symbolName: 'arrow.uturn.backward.circle.fill',
        tint: isGiven ? 'green' : 'orange',
        typeLabel: 'Погашение долга',
        title,
        amounts: [detailAmount(payload.amount, isGiven ? 'incoming' : 'outgoing')],
        debtID: payload.debt,
        isEditable: false,
        fields: [
          { title: 'Долг', value: title, symbolName: 'arrow.uturn.backward' },
          { title: 'Контрагент', value: debtOrigin?.counterparty ?? 'Контрагент', symbolName: 'person' },
          accountField(accounts.get(payload.account)),
          dateField
        ]
      }
    }

    case 'transfer':
      return {
        ...base,
        symbolName: 'arrow.left.arrow.right.circle.fill',
        tint: 'graphite',
        typeLabel: 'Перевод',
        title: 'Перевод',
        amounts: [
          detailAmount(payload.spent, 'outgoing', 'Списано'),
          detailAmount(payload.received, 'incoming', 'Зачислено')
        ],
        debtID: null,
        isEditable: true,
        fields: [
          accountField(accounts.get(payload.from), 'Счёт списания'),
          accountField(accounts.get(payload.to), 'Счёт зачисления'),
          dateField
        ]
      }
  }
}

export interface OperationDay {
  id: number
  title: string
  rows: OperationRowModel[]
}

export function makeDayTitle(day: Date): string {
  return dayTitle(day)
}

export function makeCurrencyTotal(currency: CurrencyCode, total: number): CurrencyTotal {
  return { currency, total, currencyName: currencyDisplayName(currency) }
}

export function kindOf(category: Category | undefined, kind: CategoryKind): boolean {
  return category?.kinds.includes(kind) ?? false
}
