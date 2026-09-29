import { APIFailure, type APIError } from './apiError'

export interface APIRequest {
  method?: string
  path: string
  query?: Record<string, string>
  login?: string
  body?: unknown
}

export interface APIResponse {
  status: number
  data: ArrayBuffer
  contentDisposition: string | null
}

const requestTimeout = 60_000

export class APIClient {
  private constructor(private readonly baseURL: URL) {}

  static create(server: string): APIClient | null {
    try {
      const url = new URL(server.endsWith('/') ? server : `${server}/`)
      return new APIClient(url)
    } catch {
      return null
    }
  }

  async send(request: APIRequest): Promise<APIResponse> {
    const url = this.buildURL(request)
    const headers: Record<string, string> = {}

    if (request.body !== undefined) headers['Content-Type'] = 'application/json'
    if (request.login) headers['X-Login'] = request.login

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeout)

    try {
      const response = await fetch(url, {
        method: request.method ?? 'GET',
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors'
      })

      return {
        status: response.status,
        data: await response.arrayBuffer(),
        contentDisposition: response.headers.get('Content-Disposition')
      }
    } catch {
      throw new APIFailure({ kind: 'unreachable' })
    } finally {
      clearTimeout(timeout)
    }
  }

  async sendJSON<T>(request: APIRequest): Promise<T> {
    const response = await this.send(request)
    this.validate(response)
    return this.decode<T>(response.data)
  }

  async sendExpectingSuccess(request: APIRequest): Promise<APIResponse> {
    const response = await this.send(request)
    this.validate(response)
    return response
  }

  validate(response: APIResponse): void {
    if (response.status >= 200 && response.status < 300) return
    throw new APIFailure(this.errorFrom(response))
  }

  decode<T>(data: ArrayBuffer): T {
    const text = new TextDecoder().decode(data)
    try {
      return JSON.parse(text) as T
    } catch (error) {
      const details = error instanceof Error ? error.message : 'неразбираемый JSON'
      throw new APIFailure({ kind: 'decoding', details })
    }
  }

  tryDecode<T>(data: ArrayBuffer): T | null {
    try {
      return this.decode<T>(data)
    } catch {
      return null
    }
  }

  private errorFrom(response: APIResponse): APIError {
    const envelope = this.tryDecode<{ error?: { code?: string; message?: string } }>(response.data)
    return {
      kind: 'status',
      status: response.status,
      code: envelope?.error?.code ?? '',
      message: envelope?.error?.message ?? ''
    }
  }

  private buildURL(request: APIRequest): string {
    const url = new URL(request.path.replace(/^\//, ''), this.baseURL)
    for (const [name, value] of Object.entries(request.query ?? {})) {
      url.searchParams.set(name, value)
    }
    return url.toString()
  }
}
