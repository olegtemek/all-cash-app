import { t } from '@/core/i18n'
import { pendingState, type Category, type CategoryKind } from '../model/ledger'

// Сервер хранит у категории один kind, поэтому коррекция — две отдельные категории.
export const correctionIDs: Record<CategoryKind, string> = {
  expense: '00000000-0000-0000-0000-00000000c0de',
  income: '00000000-0000-0000-0000-00000000c0df'
}

export const correctionNames = ['Коррекция', 'Correction']

export function correctionCategory(kind: CategoryKind): Category {
  return {
    id: correctionIDs[kind],
    name: t('category.correction'),
    kinds: [kind],
    symbolName: 'arrow.up.arrow.down',
    color: 'graphite',
    syncState: pendingState,
    deletedAt: null,
    seq: null
  }
}
