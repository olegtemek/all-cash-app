import { computed, ref } from 'vue'
import { APIClient } from '@/core/network/apiClient'
import { apiErrorText, asAPIError, isSessionExpired, type APIError } from '@/core/network/apiError'
import type { UserSession } from '@/features/auth/authStore'

export type ExportError =
  | { kind: 'notSignedIn' }
  | { kind: 'sessionExpired' }
  | { kind: 'serverUnreachable' }
  | { kind: 'serverFailure'; message: string }
  | { kind: 'emptyFile' }

export function exportErrorText(error: ExportError): string {
  switch (error.kind) {
    case 'notSignedIn':
      return 'Войдите на сервер, чтобы выгрузить данные'
    case 'sessionExpired':
      return 'Сервер не знает этот логин. Войдите заново'
    case 'serverUnreachable':
      return 'Сервер недоступен. Проверьте соединение'
    case 'serverFailure':
      return error.message
    case 'emptyFile':
      return 'Сервер вернул пустой файл'
  }
}

export function exportErrorFromAPI(error: APIError): ExportError {
  switch (error.kind) {
    case 'unreachable':
      return { kind: 'serverUnreachable' }
    case 'malformedServer':
    case 'decoding':
      return { kind: 'serverFailure', message: apiErrorText(error) }
    case 'status':
      return isSessionExpired(error)
        ? { kind: 'sessionExpired' }
        : { kind: 'serverFailure', message: apiErrorText(error) }
  }
}

export interface ExportedFile {
  name: string
  size: number
  receivedAt: string
  url: string
}

export class ExportStore {
  readonly isLoading = ref(false)
  readonly file = ref<ExportedFile | null>(null)
  readonly error = ref<string | null>(null)
  readonly sessionExpired = ref(false)

  readonly hasFile = computed(() => this.file.value !== null)

  async export(session: UserSession | null): Promise<void> {
    if (this.isLoading.value) return

    this.error.value = null

    if (!session) {
      this.error.value = exportErrorText({ kind: 'notSignedIn' })
      return
    }

    this.isLoading.value = true

    try {
      const file = await exportCSV(session)
      this.revokeFile()
      this.file.value = file
    } catch (error) {
      const exportError = error as ExportError
      if (exportError.kind === 'sessionExpired') this.sessionExpired.value = true
      this.error.value = exportErrorText(exportError)
    } finally {
      this.isLoading.value = false
    }
  }

  acknowledgeSessionExpiry(): void {
    this.sessionExpired.value = false
  }

  discardFile(): void {
    if (this.isLoading.value) return

    this.revokeFile()
    this.file.value = null
    this.error.value = null
  }

  private revokeFile(): void {
    const current = this.file.value
    if (current) URL.revokeObjectURL(current.url)
  }
}

async function exportCSV(session: UserSession): Promise<ExportedFile> {
  const client = APIClient.create(session.server)
  if (!client) {
    throw { kind: 'serverFailure', message: 'Адрес сервера выглядит некорректно' } satisfies ExportError
  }

  try {
    const response = await client.sendExpectingSuccess({ path: 'export/csv', login: session.login })
    if (response.data.byteLength === 0) throw { kind: 'emptyFile' } satisfies ExportError

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' })
    return {
      name: filenameFrom(response.contentDisposition) ?? defaultName(),
      size: blob.size,
      receivedAt: new Date().toISOString(),
      url: URL.createObjectURL(blob)
    }
  } catch (error) {
    const apiError = asAPIError(error)
    if (apiError) throw exportErrorFromAPI(apiError)
    throw error
  }
}

function filenameFrom(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null

  const marker = contentDisposition.indexOf('filename=')
  if (marker < 0) return null

  let value = contentDisposition.slice(marker + 'filename='.length)
  if (value.startsWith('"')) value = value.slice(1).split('"')[0] ?? ''
  else value = value.split(';')[0] ?? ''

  value = value.trim()
  return value.length === 0 ? null : value
}

function defaultName(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `operations-${now.getFullYear()}-${month}-${day}.csv`
}

export const exportStore = new ExportStore()
