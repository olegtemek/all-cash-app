import type { UUID } from '@/core/model/ledger'
import { repaymentsWording } from '@/core/model/analytics'
import type { LedgerStore } from '@/core/store/ledgerStore'

export function deletionWarning(operationID: UUID, store: LedgerStore, title?: string): string {
  const repayments = store.repaymentCount(operationID)

  const body =
    repayments > 0
      ? `Вместе с долгом удалится ${repaymentsWording(repayments)}. Вернуть их будет нельзя, баланс счёта пересчитается.`
      : 'Операцию нельзя будет вернуть, баланс счёта пересчитается.'

  if (!title) return body
  return `${title} — ${body.charAt(0).toLowerCase()}${body.slice(1)}`
}
