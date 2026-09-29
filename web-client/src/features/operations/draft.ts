import { AmountExpression, type AmountKey } from '@/core/model/amountExpression'
import type { CategoryKind, DebtDirection, MoneyOperation, UUID } from '@/core/model/ledger'

export type OperationFormKind = 'entry' | 'debt' | 'transfer'

export const operationFormKinds: OperationFormKind[] = ['entry', 'debt', 'transfer']

export function formKindTitle(kind: OperationFormKind): string {
  switch (kind) {
    case 'entry':
      return 'Расход/доход'
    case 'debt':
      return 'Долг'
    case 'transfer':
      return 'Перевод'
  }
}

export type AmountSlot = 'primary' | 'received'

export interface OperationDraft {
  kind: OperationFormKind
  entryKind: CategoryKind
  debtDirection: DebtDirection
  amount: AmountExpression
  receivedAmount: AmountExpression
  date: string
  note: string
  counterparty: string
  accountID: UUID | null
  destinationAccountID: UUID | null
  categoryID: UUID | null
  activeSlot: AmountSlot
}

export function emptyDraft(): OperationDraft {
  return {
    kind: 'entry',
    entryKind: 'expense',
    debtDirection: 'given',
    amount: AmountExpression.empty(),
    receivedAmount: AmountExpression.empty(),
    date: new Date().toISOString(),
    note: '',
    counterparty: '',
    accountID: null,
    destinationAccountID: null,
    categoryID: null,
    activeSlot: 'primary'
  }
}

export function draftFromOperation(operation: MoneyOperation): OperationDraft | null {
  const draft = emptyDraft()
  draft.date = operation.date
  draft.note = operation.note ?? ''

  const payload = operation.payload
  switch (payload.kind) {
    case 'expense':
    case 'income':
      draft.kind = 'entry'
      draft.entryKind = payload.kind
      draft.categoryID = payload.category
      draft.accountID = payload.account
      draft.amount = AmountExpression.fromAmount(payload.amount.amount)
      return draft

    case 'debt':
      draft.kind = 'debt'
      draft.debtDirection = payload.direction
      draft.counterparty = payload.counterparty
      draft.accountID = payload.account
      draft.amount = AmountExpression.fromAmount(payload.amount.amount)
      return draft

    case 'transfer':
      draft.kind = 'transfer'
      draft.accountID = payload.from
      draft.destinationAccountID = payload.to
      draft.amount = AmountExpression.fromAmount(payload.spent.amount)
      draft.receivedAmount = AmountExpression.fromAmount(payload.received.amount)
      return draft

    case 'repayment':
      return null
  }
}

export function isEditingReceived(draft: OperationDraft): boolean {
  return draft.kind === 'transfer' && draft.activeSlot === 'received'
}

export function activeAmount(draft: OperationDraft): AmountExpression {
  return isEditingReceived(draft) ? draft.receivedAmount : draft.amount
}

export function applyKey(draft: OperationDraft, key: AmountKey): void {
  if (isEditingReceived(draft)) draft.receivedAmount = draft.receivedAmount.input(key)
  else draft.amount = draft.amount.input(key)
}

export function draftDiffers(left: OperationDraft, right: OperationDraft): boolean {
  return (
    left.kind !== right.kind ||
    left.entryKind !== right.entryKind ||
    left.debtDirection !== right.debtDirection ||
    left.amount.text !== right.amount.text ||
    left.receivedAmount.text !== right.receivedAmount.text ||
    left.date !== right.date ||
    left.note !== right.note ||
    left.counterparty !== right.counterparty ||
    left.accountID !== right.accountID ||
    left.destinationAccountID !== right.destinationAccountID ||
    left.categoryID !== right.categoryID
  )
}

export type OperationFormMode = { kind: 'creating' } | { kind: 'editing'; id: UUID }

export function modeTitle(mode: OperationFormMode): string {
  return mode.kind === 'editing' ? 'Изменение операции' : 'Новая операция'
}

export function modeFailureTitle(mode: OperationFormMode): string {
  return mode.kind === 'editing' ? 'Не удалось сохранить' : 'Не удалось записать'
}
