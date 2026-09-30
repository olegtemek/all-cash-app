import { t } from '@/core/i18n'
import type { AmountExpression, AmountValue } from './amountExpression'
import type { Account, Category, CategoryKind } from './ledger'
import { formatBalance, type Money } from './money'

export type AccountError = 'emptyName' | 'duplicateName' | 'divisionByZero'

export function accountErrorText(error: AccountError): string {
  switch (error) {
    case 'emptyName':
      return t('err.account.emptyName')
    case 'duplicateName':
      return t('err.account.duplicateName')
    case 'divisionByZero':
      return t('common.divisionByZero')
  }
}

export const AccountRules = {
  validateName(raw: string, existing: string[]): AccountError | null {
    const name = raw.trim()
    if (name.length === 0) return 'emptyName'

    const taken = existing.map((item) => item.trim().toLowerCase())
    return taken.includes(name.toLowerCase()) ? 'duplicateName' : null
  },

  validateBalance(balance: AmountValue): AccountError | null {
    if (balance.ok) return null
    return balance.failure === 'divisionByZero' ? 'divisionByZero' : null
  }
}

export type RepaymentError =
  | { kind: 'emptyAmount' }
  | { kind: 'notPositive' }
  | { kind: 'exceedsOutstanding'; remainder: string }
  | { kind: 'noAccount' }
  | { kind: 'currencyMismatch'; currency: string }

export function repaymentErrorText(error: RepaymentError): string {
  switch (error.kind) {
    case 'emptyAmount':
      return t('err.repay.emptyAmount')
    case 'notPositive':
      return t('common.amountMustBePositive')
    case 'exceedsOutstanding':
      return t('err.repay.exceeds', { remainder: error.remainder })
    case 'noAccount':
      return t('common.chooseAccount')
    case 'currencyMismatch':
      return t('err.repay.currencyMismatch', { currency: error.currency })
  }
}

export const DebtRules = {
  validateRepayment(amount: number | null, outstanding: Money, account: Account | null): RepaymentError | null {
    if (amount === null) return { kind: 'emptyAmount' }
    if (amount <= 0) return { kind: 'notPositive' }
    if (amount > outstanding.amount) {
      return { kind: 'exceedsOutstanding', remainder: formatBalance(outstanding.amount, outstanding.currency) }
    }

    if (!account) return { kind: 'noAccount' }
    if (account.currency !== outstanding.currency) {
      return { kind: 'currencyMismatch', currency: outstanding.currency }
    }
    return null
  }
}

export type OperationError =
  | { kind: 'emptyAmount' }
  | { kind: 'notPositive' }
  | { kind: 'divisionByZero' }
  | { kind: 'noAccount' }
  | { kind: 'noCategory' }
  | { kind: 'emptyCounterparty' }
  | { kind: 'emptyReceivedAmount' }
  | { kind: 'receivedNotPositive' }
  | { kind: 'noDestinationAccount' }
  | { kind: 'sameAccount' }
  | { kind: 'belowRepaid'; minimum: string }
  | { kind: 'debtCurrencyLocked'; currency: string }

export function operationErrorText(error: OperationError): string {
  switch (error.kind) {
    case 'emptyAmount':
      return t('err.op.emptyAmount')
    case 'notPositive':
      return t('common.amountMustBePositive')
    case 'divisionByZero':
      return t('err.op.divisionByZero')
    case 'noAccount':
      return t('common.chooseAccount')
    case 'noCategory':
      return t('err.op.noCategory')
    case 'emptyCounterparty':
      return t('err.op.emptyCounterparty')
    case 'emptyReceivedAmount':
      return t('err.op.emptyReceived')
    case 'receivedNotPositive':
      return t('err.op.receivedNotPositive')
    case 'noDestinationAccount':
      return t('err.op.noDestination')
    case 'sameAccount':
      return t('err.op.sameAccount')
    case 'belowRepaid':
      return t('err.op.belowRepaid', { minimum: error.minimum })
    case 'debtCurrencyLocked':
      return t('err.op.currencyLocked', { currency: error.currency })
  }
}

export type AmountResult = { ok: true; value: number } | { ok: false; error: OperationError }

export const OperationRules = {
  amount(
    expression: AmountExpression,
    empty: OperationError = { kind: 'emptyAmount' },
    notPositive: OperationError = { kind: 'notPositive' }
  ): AmountResult {
    const result = expression.value
    if (result.ok) {
      return result.value > 0 ? { ok: true, value: result.value } : { ok: false, error: notPositive }
    }
    if (result.failure === 'empty') return { ok: false, error: empty }
    return { ok: false, error: { kind: 'divisionByZero' } }
  },

  validateEntry(
    expression: AmountExpression,
    account: Account | null,
    category: Category | null
  ): OperationError | null {
    const amount = OperationRules.amount(expression)
    if (!amount.ok) return amount.error
    if (!account) return { kind: 'noAccount' }
    if (!category) return { kind: 'noCategory' }
    return null
  },

  validateDebt(expression: AmountExpression, account: Account | null, counterparty: string): OperationError | null {
    const amount = OperationRules.amount(expression)
    if (!amount.ok) return amount.error
    if (!account) return { kind: 'noAccount' }
    if (counterparty.trim().length === 0) return { kind: 'emptyCounterparty' }
    return null
  },

  validateDebtEdit(amount: number, account: Account | null, minimum: Money): OperationError | null {
    if (!account) return { kind: 'noAccount' }
    if (account.currency !== minimum.currency) {
      return { kind: 'debtCurrencyLocked', currency: minimum.currency }
    }
    if (amount < minimum.amount) {
      return { kind: 'belowRepaid', minimum: formatBalance(minimum.amount, minimum.currency) }
    }
    return null
  },

  validateTransfer(
    spent: AmountExpression,
    from: Account | null,
    received: AmountExpression,
    to: Account | null
  ): OperationError | null {
    const spentAmount = OperationRules.amount(spent)
    if (!spentAmount.ok) return spentAmount.error
    if (!from) return { kind: 'noAccount' }

    const receivedAmount = OperationRules.amount(
      received,
      { kind: 'emptyReceivedAmount' },
      { kind: 'receivedNotPositive' }
    )
    if (!receivedAmount.ok) return receivedAmount.error

    if (!to) return { kind: 'noDestinationAccount' }
    if (to.id === from.id) return { kind: 'sameAccount' }
    return null
  }
}

export type CategoryError = 'emptyName' | 'noKind' | 'duplicateName'

export function categoryErrorText(error: CategoryError): string {
  switch (error) {
    case 'emptyName':
      return t('err.category.emptyName')
    case 'noKind':
      return t('err.category.noKind')
    case 'duplicateName':
      return t('err.category.duplicateName')
  }
}

export const CategoryRules = {
  validate(raw: string, kinds: CategoryKind[], existing: string[]): CategoryError | null {
    const name = raw.trim()
    if (name.length === 0) return 'emptyName'
    if (kinds.length === 0) return 'noKind'

    const taken = existing.map((item) => item.trim().toLowerCase())
    return taken.includes(name.toLowerCase()) ? 'duplicateName' : null
  }
}

export type AuthError =
  | { kind: 'emptyServer' }
  | { kind: 'malformedServer' }
  | { kind: 'emptyLogin' }
  | { kind: 'shortLogin' }
  | { kind: 'unknownLogin' }
  | { kind: 'loginTaken' }
  | { kind: 'emptyPassword' }
  | { kind: 'shortPassword' }
  | { kind: 'wrongPassword' }
  | { kind: 'serverUnreachable' }
  | { kind: 'unknown'; message: string }

export const minLoginLength = 3
export const minPasswordLength = 6

export function authErrorText(error: AuthError): string {
  switch (error.kind) {
    case 'emptyServer':
      return t('err.auth.emptyServer')
    case 'malformedServer':
      return t('common.badServerAddress')
    case 'emptyLogin':
      return t('err.auth.emptyLogin')
    case 'shortLogin':
      return t('err.auth.shortLogin', { min: minLoginLength })
    case 'unknownLogin':
      return t('err.auth.unknownLogin')
    case 'loginTaken':
      return t('err.auth.loginTaken')
    case 'emptyPassword':
      return t('err.auth.emptyPassword')
    case 'shortPassword':
      return t('err.auth.shortPassword', { min: minPasswordLength })
    case 'wrongPassword':
      return t('err.auth.wrongPassword')
    case 'serverUnreachable':
      return t('common.unreachableServer')
    case 'unknown':
      return error.message
  }
}

export const AuthRules = {
  normalizedServer(raw: string): string | null {
    const trimmed = raw.trim()
    if (trimmed.length === 0) return null

    const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`

    let url: URL
    try {
      url = new URL(withScheme)
    } catch {
      return null
    }

    const scheme = url.protocol.replace(':', '').toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') return null

    const host = url.hostname
    if (host.length === 0) return null
    if (!host.includes('.') && host !== 'localhost') return null

    let normalized = `${scheme}://${host}`
    if (url.port.length > 0) normalized += `:${url.port}`

    const path = url.pathname.replace(/^\/+|\/+$/g, '')
    if (path.length > 0) normalized += `/${path}`
    return normalized
  },

  validateServer(raw: string): AuthError | null {
    if (raw.trim().length === 0) return { kind: 'emptyServer' }
    if (AuthRules.normalizedServer(raw) === null) return { kind: 'malformedServer' }
    return null
  },

  validateLogin(raw: string): AuthError | null {
    const login = raw.trim()
    if (login.length === 0) return { kind: 'emptyLogin' }
    if (login.length < minLoginLength) return { kind: 'shortLogin' }
    return null
  },

  validatePassword(raw: string): AuthError | null {
    if (raw.length === 0) return { kind: 'emptyPassword' }
    if (raw.length < minPasswordLength) return { kind: 'shortPassword' }
    return null
  },

  normalizedLogin(raw: string): string {
    return raw.trim().toLowerCase()
  }
}
