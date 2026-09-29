import { interfaceLocale } from './locale'
import type { UUID } from './ledger'
import type { CurrencyCode, PaletteColorLike } from './analyticsTypes'
import { formatBalance, spokenBalance } from './money'

export type { PaletteColorLike }

export class AnalyticsPeriod {
  private constructor(public readonly start: Date) {}

  static containing(date: Date): AnalyticsPeriod {
    return new AnalyticsPeriod(new Date(date.getFullYear(), date.getMonth(), 1))
  }

  static current(now: Date = new Date()): AnalyticsPeriod {
    return AnalyticsPeriod.containing(now)
  }

  get id(): number {
    return this.start.getTime()
  }

  get end(): Date {
    return new Date(this.start.getFullYear(), this.start.getMonth() + 1, 1)
  }

  contains(date: Date): boolean {
    return date >= this.start && date < this.end
  }

  shifted(months: number): AnalyticsPeriod {
    return new AnalyticsPeriod(new Date(this.start.getFullYear(), this.start.getMonth() + months, 1))
  }

  equals(other: AnalyticsPeriod): boolean {
    return this.id === other.id
  }

  get title(): string {
    const month = new Intl.DateTimeFormat(interfaceLocale, { month: 'long' }).format(this.start)
    const capitalized = month.charAt(0).toLocaleUpperCase(interfaceLocale) + month.slice(1)
    return `${capitalized} ${this.start.getFullYear()}`
  }
}

export const uncategorizedID: UUID = '00000000-0000-0000-0000-000000000000'
export const uncategorizedName = 'Без категории'

export interface CategorySpending {
  id: UUID
  name: string
  symbolName: string
  color: PaletteColorLike
  total: { amount: number; currency: CurrencyCode }
  share: number
  operationCount: number
}

export function shareTitle(share: number): string {
  return new Intl.NumberFormat(interfaceLocale, { style: 'percent', maximumFractionDigits: 0 }).format(share)
}

export function spendingAccessibilityLabel(spending: CategorySpending): string {
  return [
    spending.name,
    shareTitle(spending.share),
    operationsWording(spending.operationCount),
    spokenBalance(spending.total.amount, spending.total.currency)
  ].join(', ')
}

export function spendingTotalTitle(spending: CategorySpending): string {
  return formatBalance(spending.total.amount, spending.total.currency)
}

export interface AnalyticsReport {
  period: AnalyticsPeriod
  currency: CurrencyCode
  categories: CategorySpending[]
  total: { amount: number; currency: CurrencyCode }
}

export function operationsWording(count: number): string {
  const plural = new Intl.PluralRules('ru-RU').select(count)
  switch (plural) {
    case 'one':
      return `${count} операция`
    case 'few':
      return `${count} операции`
    default:
      return `${count} операций`
  }
}

export function entriesWording(count: number): string {
  const plural = new Intl.PluralRules('ru-RU').select(count)
  switch (plural) {
    case 'one':
      return `${count} запись`
    case 'few':
      return `${count} записи`
    default:
      return `${count} записей`
  }
}

export function repaymentsWording(count: number): string {
  const plural = new Intl.PluralRules('ru-RU').select(count)
  switch (plural) {
    case 'one':
      return `${count} погашение`
    case 'few':
      return `${count} погашения`
    default:
      return `${count} погашений`
  }
}
