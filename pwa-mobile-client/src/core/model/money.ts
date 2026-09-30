import { t } from '@/core/i18n'
import { interfaceLocale } from './locale'

export type CurrencyCode = string

export const supportedCurrencies: CurrencyCode[] = ['KZT', 'USD', 'CNY', 'RUB']

export function currencyCode(raw: string): CurrencyCode {
  return raw.trim().toUpperCase()
}

export function preferredCurrency(): CurrencyCode {
  const fromLocale = new Intl.NumberFormat(interfaceLocale, { style: 'currency', currency: 'KZT' })
  void fromLocale
  return 'KZT'
}

const displayNames = new Intl.DisplayNames([interfaceLocale], { type: 'currency' })

export function currencyDisplayName(code: CurrencyCode): string {
  try {
    return displayNames.of(code) ?? code
  } catch {
    return code
  }
}

export function currencySymbol(code: CurrencyCode): string {
  try {
    const parts = new Intl.NumberFormat(interfaceLocale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol'
    }).formatToParts(0)
    return parts.find((part) => part.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

export interface Money {
  readonly amount: number
  readonly currency: CurrencyCode
}

export function money(amount: number, currency: CurrencyCode): Money {
  return { amount, currency }
}

export type Direction = 'outgoing' | 'incoming'

export const minusSign = '−'

export function directionSign(direction: Direction): string {
  return direction === 'outgoing' ? minusSign : '+'
}

export function directionSpokenSign(direction: Direction): string {
  return direction === 'outgoing' ? t('spoken.minus') : t('spoken.plus')
}

export function formatBalance(amount: number, currency: CurrencyCode): string {
  try {
    return new Intl.NumberFormat(interfaceLocale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function spokenBalance(amount: number, currency: CurrencyCode): string {
  try {
    return new Intl.NumberFormat(interfaceLocale, {
      style: 'currency',
      currency,
      currencyDisplay: 'name',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function formatMoney(value: Money, direction: Direction): string {
  return directionSign(direction) + formatBalance(value.amount, value.currency)
}

export function spokenMoney(value: Money, direction: Direction): string {
  return `${directionSpokenSign(direction)} ${spokenBalance(value.amount, value.currency)}`
}
