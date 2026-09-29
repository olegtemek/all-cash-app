import { pendingState, type Category } from '../model/ledger'

export const correctionID = '00000000-0000-0000-0000-00000000c0de'

export const correctionNames = ['Коррекция', 'Correction']

export function correctionCategory(): Category {
  return {
    id: correctionID,
    name: 'Коррекция',
    kinds: ['expense', 'income'],
    symbolName: 'arrow.up.arrow.down',
    color: 'graphite',
    syncState: pendingState,
    deletedAt: null,
    seq: null
  }
}
