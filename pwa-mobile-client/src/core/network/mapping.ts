import {
  categoryKinds,
  failedState,
  syncedState,
  type Account,
  type Category,
  type CategoryKind,
  type DebtDirection,
  type MoneyOperation,
  type Payload
} from '../model/ledger'
import { currencyCode, money } from '../model/money'
import { isPaletteColor } from '../model/palette'
import type { LedgerSnapshot, PullPage, PushResult } from '../model/syncPayloads'
import { APIFormat } from './apiFormat'
import type {
  AccountDTO,
  CategoryDTO,
  OperationDTO,
  PullResponseDTO,
  PushRequestDTO,
  PushResponseDTO
} from './dto'

void failedState

export function accountDTO(account: Account): AccountDTO {
  return {
    id: APIFormat.stringFromUUID(account.id),
    name: account.name,
    currency: account.currency,
    initialBalance: APIFormat.stringFromDecimal(account.initialBalance),
    isArchived: account.isArchived,
    isHidden: account.isHidden,
    deletedAt: account.deletedAt ? APIFormat.stringFromDate(account.deletedAt) : null
  }
}

export function categoryDTO(category: Category): CategoryDTO {
  return {
    id: APIFormat.stringFromUUID(category.id),
    name: category.name,
    kind: category.kinds.includes('expense') ? 'expense' : 'income',
    symbolName: category.symbolName,
    color: category.color,
    deletedAt: category.deletedAt ? APIFormat.stringFromDate(category.deletedAt) : null
  }
}

export function operationDTO(operation: MoneyOperation): OperationDTO {
  let kind = ''
  let accountId = ''
  let amount = ''
  let currency = ''
  let categoryId: string | null = null
  let counterparty: string | null = null
  let debtDirection: string | null = null
  let debtId: string | null = null
  let destinationAccountId: string | null = null
  let destinationAmount: string | null = null
  let destinationCurrency: string | null = null

  const payload = operation.payload
  switch (payload.kind) {
    case 'expense':
    case 'income':
      kind = payload.kind
      categoryId = APIFormat.stringFromUUID(payload.category)
      accountId = APIFormat.stringFromUUID(payload.account)
      amount = APIFormat.stringFromDecimal(payload.amount.amount)
      currency = payload.amount.currency
      break

    case 'debt':
      kind = 'debt'
      counterparty = payload.counterparty
      debtDirection = payload.direction
      accountId = APIFormat.stringFromUUID(payload.account)
      amount = APIFormat.stringFromDecimal(payload.amount.amount)
      currency = payload.amount.currency
      break

    case 'repayment':
      kind = 'repayment'
      debtId = APIFormat.stringFromUUID(payload.debt)
      accountId = APIFormat.stringFromUUID(payload.account)
      amount = APIFormat.stringFromDecimal(payload.amount.amount)
      currency = payload.amount.currency
      break

    case 'transfer':
      kind = 'transfer'
      accountId = APIFormat.stringFromUUID(payload.from)
      amount = APIFormat.stringFromDecimal(payload.spent.amount)
      currency = payload.spent.currency
      destinationAccountId = APIFormat.stringFromUUID(payload.to)
      destinationAmount = APIFormat.stringFromDecimal(payload.received.amount)
      destinationCurrency = payload.received.currency
      break
  }

  return {
    id: APIFormat.stringFromUUID(operation.id),
    date: APIFormat.stringFromDate(operation.date),
    createdAt: APIFormat.stringFromDate(operation.createdAt),
    note: operation.note,
    kind,
    accountId,
    amount,
    currency,
    categoryId,
    counterparty,
    debtDirection,
    debtId,
    destinationAccountId,
    destinationAmount,
    destinationCurrency,
    deletedAt: operation.deletedAt ? APIFormat.stringFromDate(operation.deletedAt) : null
  }
}

export function accountFromDTO(dto: AccountDTO): Account | null {
  const id = APIFormat.uuidFromString(dto.id)
  const initialBalance = APIFormat.decimalFromString(dto.initialBalance)
  if (!id || initialBalance === null) return null

  return {
    id,
    name: dto.name,
    currency: currencyCode(dto.currency),
    initialBalance,
    isArchived: dto.isArchived,
    isHidden: dto.isHidden ?? false,
    syncState: syncedState,
    deletedAt: dto.deletedAt ? APIFormat.dateFromString(dto.deletedAt) : null,
    seq: dto.seq ?? null
  }
}

export function categoryFromDTO(dto: CategoryDTO): Category | null {
  const id = APIFormat.uuidFromString(dto.id)
  if (!id) return null
  if (!categoryKinds.includes(dto.kind as CategoryKind)) return null
  if (!isPaletteColor(dto.color)) return null

  return {
    id,
    name: dto.name,
    kinds: [dto.kind as CategoryKind],
    symbolName: dto.symbolName,
    color: dto.color,
    syncState: syncedState,
    deletedAt: dto.deletedAt ? APIFormat.dateFromString(dto.deletedAt) : null,
    seq: dto.seq ?? null
  }
}

export function operationFromDTO(dto: OperationDTO): MoneyOperation | null {
  const id = APIFormat.uuidFromString(dto.id)
  const date = APIFormat.dateFromString(dto.date)
  const createdAt = APIFormat.dateFromString(dto.createdAt)
  const account = APIFormat.uuidFromString(dto.accountId)
  const amount = APIFormat.decimalFromString(dto.amount)
  if (!id || !date || !createdAt || !account || amount === null) return null

  const payload = payloadFromDTO(dto, account, money(amount, currencyCode(dto.currency)))
  if (!payload) return null

  return {
    id,
    date,
    createdAt,
    note: dto.note ?? null,
    syncState: syncedState,
    deletedAt: dto.deletedAt ? APIFormat.dateFromString(dto.deletedAt) : null,
    seq: dto.seq ?? null,
    payload
  }
}

function payloadFromDTO(dto: OperationDTO, account: string, amount: ReturnType<typeof money>): Payload | null {
  switch (dto.kind) {
    case 'expense':
    case 'income': {
      const category = dto.categoryId ? APIFormat.uuidFromString(dto.categoryId) : null
      if (!category) return null
      return { kind: dto.kind, category, account, amount }
    }

    case 'debt': {
      const direction = dto.debtDirection
      if (!dto.counterparty || (direction !== 'given' && direction !== 'taken')) return null
      return {
        kind: 'debt',
        direction: direction as DebtDirection,
        counterparty: dto.counterparty,
        account,
        amount
      }
    }

    case 'repayment': {
      const debt = dto.debtId ? APIFormat.uuidFromString(dto.debtId) : null
      if (!debt) return null
      return { kind: 'repayment', debt, account, amount }
    }

    case 'transfer': {
      const destination = dto.destinationAccountId ? APIFormat.uuidFromString(dto.destinationAccountId) : null
      const received = dto.destinationAmount ? APIFormat.decimalFromString(dto.destinationAmount) : null
      if (!destination || received === null || !dto.destinationCurrency) return null
      return {
        kind: 'transfer',
        from: account,
        spent: amount,
        to: destination,
        received: money(received, currencyCode(dto.destinationCurrency))
      }
    }

    default:
      return null
  }
}

export function pullPageFromDTO(dto: PullResponseDTO): PullPage {
  return {
    accounts: (dto.accounts ?? []).map(accountFromDTO).filter((item): item is Account => item !== null),
    categories: (dto.categories ?? []).map(categoryFromDTO).filter((item): item is Category => item !== null),
    operations: (dto.operations ?? [])
      .map(operationFromDTO)
      .filter((item): item is MoneyOperation => item !== null),
    nextSeq: dto.nextSeq,
    hasMore: dto.hasMore
  }
}

export function pushResultFromDTO(dto: PushResponseDTO): PushResult {
  const accepted: Record<string, number> = {}
  for (const [raw, seq] of Object.entries(dto.accepted ?? {})) {
    const id = APIFormat.uuidFromString(raw)
    if (id) accepted[id] = seq
  }

  const rejected: Record<string, string> = {}
  for (const [raw, reason] of Object.entries(dto.rejected ?? {})) {
    const id = APIFormat.uuidFromString(raw)
    if (id) rejected[id] = reason
  }

  const finishedAt = dto.finishedAt ? APIFormat.dateFromString(dto.finishedAt) : null
  return { accepted, rejected, finishedAt: finishedAt ?? new Date().toISOString() }
}

export function pushRequestDTO(snapshot: LedgerSnapshot): PushRequestDTO {
  return {
    accounts: snapshot.accounts.map(accountDTO),
    categories: snapshot.categories.map(categoryDTO),
    operations: snapshot.operations.map(operationDTO)
  }
}
