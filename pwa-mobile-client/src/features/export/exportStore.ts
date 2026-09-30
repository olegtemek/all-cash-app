import { t, type MessageKey } from '@/core/i18n'
import { ref } from 'vue'
import {
  BackupFailure,
  backupFilename,
  makeBackup,
  operationsCSV,
  parseBackup,
  serializeBackup,
  type CSVLabels
} from '@/core/model/backup'
import { formatFileSize } from '@/core/model/dates'
import { appLocale } from '@/core/model/locale'
import { isSnapshotEmpty } from '@/core/model/syncPayloads'
import { ledgerStore } from '@/core/store/ledgerStore'

function csvLabels(): CSVLabels {
  const key = (name: string) => t(`export.csv.${name}` as MessageKey)
  return {
    header: ['date', 'type', 'account', 'category', 'counterparty', 'amount', 'currency', 'transfer', 'direction', 'note'].map(key),
    kinds: {
      expense: key('kind.expense'),
      income: key('kind.income'),
      debt: key('kind.debt'),
      repayment: key('kind.repayment'),
      transfer: key('kind.transfer')
    },
    directions: { given: key('direction.given'), taken: key('direction.taken') },
    delimiter: appLocale === 'ru' ? ';' : ','
  }
}

function backupErrorText(error: unknown): string {
  if (!(error instanceof BackupFailure)) return t('export.error.read')
  const failure = error.error
  switch (failure.kind) {
    case 'notJSON':
      return t('export.error.notJSON')
    case 'notBackup':
      return t('export.error.notBackup')
    case 'newerVersion':
      return t('export.error.newerVersion')
    case 'invalid':
      return t('export.error.invalid', { path: failure.path })
  }
}

export class ExportStore {
  readonly isBusy = ref(false)
  readonly message = ref<string | null>(null)
  readonly error = ref<string | null>(null)

  exportBackup(): void {
    const snapshot = ledgerStore.snapshot()
    if (isSnapshotEmpty(snapshot)) return this.fail(t('export.nothing'))

    this.download(serializeBackup(makeBackup(snapshot)), backupFilename('json'), 'application/json')
  }

  exportCSV(): void {
    const snapshot = ledgerStore.snapshot()
    if (snapshot.operations.every((operation) => operation.deletedAt !== null)) return this.fail(t('export.nothing'))

    this.download(operationsCSV(snapshot, csvLabels()), backupFilename('csv'), 'text/csv;charset=utf-8')
  }

  async importBackup(file: File): Promise<void> {
    if (this.isBusy.value) return

    this.error.value = null
    this.message.value = null
    this.isBusy.value = true

    try {
      const text = await file.text().catch(() => {
        throw new Error('read')
      })
      const snapshot = parseBackup(text)

      if (!(await ledgerStore.importSnapshot(snapshot))) {
        this.error.value = ledgerStore.actionError.value
        return
      }

      this.message.value = t('export.imported', {
        accounts: snapshot.accounts.length,
        categories: snapshot.categories.length,
        operations: snapshot.operations.length
      })
    } catch (error) {
      this.error.value = backupErrorText(error)
    } finally {
      this.isBusy.value = false
    }
  }

  private fail(message: string): void {
    this.message.value = null
    this.error.value = message
  }

  private download(content: string, name: string, type: string): void {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)

    this.error.value = null
    this.message.value = t('export.done', { name, size: formatFileSize(blob.size) })
  }
}

export const exportStore = new ExportStore()
