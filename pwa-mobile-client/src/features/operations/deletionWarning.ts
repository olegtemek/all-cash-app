import { t } from '@/core/i18n'
import type { UUID } from '@/core/model/ledger'
import { repaymentsWording } from '@/core/model/analytics'
import type { LedgerStore } from '@/core/store/ledgerStore'

export function deletionWarning(operationID: UUID, store: LedgerStore, title?: string): string {
  const repayments = store.repaymentCount(operationID)

  const body =
    repayments > 0
      ? t('delete.withRepayments', { repayments: repaymentsWording(repayments) })
      : t('delete.plain')

  if (!title) return body
  return `${title} — ${body.charAt(0).toLowerCase()}${body.slice(1)}`
}
