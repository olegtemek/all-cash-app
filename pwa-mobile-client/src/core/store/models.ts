import { t } from '@/core/i18n'
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
  if (account.isHidden) return t('a11y.balanceHidden', { name: account.name, currency: account.currencyName })
  return t('a11y.balance', { name: account.name, currency: account.currencyName, balance: spokenBalance(account.balance, account.currency) })
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
  return direction === 'given' ? t('debt.owedToMe') : t('debt.iOwe')
}

export function debtStateTitle(debt: DebtSummary): string {
  const state = isDebtClosed(debt) ? t('debt.closed') : debt.repayments.length === 0 ? t('debt.open') : t('debt.partlyRepaid')
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
        typeLabel: isExpense ? t('common.expense') : t('common.income'),
        title: category?.name ?? t('common.noCategory'),
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
        typeLabel: t('common.debt'),
        title: isGiven ? t('debt.gave') : t('debt.took'),
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
        typeLabel: t('debt.repaymentType'),
        title: isGiven ? t('debt.gaveBack') : t('debt.tookBack'),
        subtitle: joined(debtOrigin?.counterparty, operation.note),
        amounts: [rowAmount(payload.amount, isGiven ? 'incoming' : 'outgoing')],
        isEditable: false
      }
    }

    case 'transfer': {
      const route = `${accounts.get(payload.from)?.name ?? t('common.accountFallback')} → ${accounts.get(payload.to)?.name ?? t('common.accountFallback')}`
      return {
        ...base,
        symbolName: 'arrow.left.arrow.right.circle.fill',
        tint: 'graphite',
        typeLabel: t('common.transfer'),
        title: t('common.transfer'),
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
      return t('common.notSynced')
    case 'synced':
      return t('op.synced')
    case 'failed':
      return t('op.syncFailed', { reason: state.reason })
  }
}

export function detailAccessibilityLabel(detail: OperationDetail): string {
  const parts = [detail.typeLabel, detail.title]
  parts.push(...detail.amounts.map((amount) => (amount.label ? `${amount.label}: ${amount.spoken}` : amount.spoken)))
  return parts.join(', ')
}

function accountField(account: Account | undefined, title = t('common.account')): DetailField {
  return { title, value: account?.name ?? t('op.accountDeleted'), symbolName: 'creditcard' }
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
  const dateField: DetailField = { title: t('common.date'), value: fullDate(new Date(operation.date)), symbolName: 'calendar' }
  const base = { id: operation.id, syncState: operation.syncState, note: operation.note }
  const payload = operation.payload

  switch (payload.kind) {
    case 'expense':
    case 'income': {
      const category = categories.get(payload.category)
      const isExpense = payload.kind === 'expense'
      const title = category?.name ?? t('common.noCategory')
      return {
        ...base,
        symbolName: category?.symbolName ?? 'questionmark.circle',
        tint: category?.color ?? 'graphite',
        typeLabel: isExpense ? t('common.expense') : t('common.income'),
        title,
        amounts: [detailAmount(payload.amount, isExpense ? 'outgoing' : 'incoming')],
        debtID: null,
        isEditable: true,
        fields: [
          { title: t('common.category'), value: title, symbolName: 'square.grid.2x2' },
          accountField(accounts.get(payload.account)),
          dateField
        ]
      }
    }

    case 'debt': {
      const isGiven = payload.direction === 'given'
      const title = isGiven ? t('debt.gave') : t('debt.took')
      return {
        ...base,
        symbolName: isGiven ? 'person.crop.circle.badge.minus' : 'person.crop.circle.badge.plus',
        tint: isGiven ? 'orange' : 'blue',
        typeLabel: t('common.debt'),
        title,
        amounts: [detailAmount(payload.amount, isGiven ? 'outgoing' : 'incoming')],
        debtID: operation.id,
        isEditable: true,
        fields: [
          { title: t('common.direction'), value: title, symbolName: 'arrow.left.arrow.right' },
          { title: t('common.counterparty'), value: payload.counterparty, symbolName: 'person' },
          accountField(accounts.get(payload.account)),
          dateField
        ]
      }
    }

    case 'repayment': {
      const isGiven = debtOrigin?.direction === 'given'
      const title = isGiven ? t('debt.gaveBack') : t('debt.tookBack')
      return {
        ...base,
        symbolName: 'arrow.uturn.backward.circle.fill',
        tint: isGiven ? 'green' : 'orange',
        typeLabel: t('debt.repaymentType'),
        title,
        amounts: [detailAmount(payload.amount, isGiven ? 'incoming' : 'outgoing')],
        debtID: payload.debt,
        isEditable: false,
        fields: [
          { title: t('common.debt'), value: title, symbolName: 'arrow.uturn.backward' },
          { title: t('common.counterparty'), value: debtOrigin?.counterparty ?? t('common.counterparty'), symbolName: 'person' },
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
        typeLabel: t('common.transfer'),
        title: t('common.transfer'),
        amounts: [
          detailAmount(payload.spent, 'outgoing', t('op.spent')),
          detailAmount(payload.received, 'incoming', t('op.received'))
        ],
        debtID: null,
        isEditable: true,
        fields: [
          accountField(accounts.get(payload.from), t('op.sourceAccount')),
          accountField(accounts.get(payload.to), t('op.destinationAccount')),
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
