import { computed, ref } from 'vue'
import { APIClient } from '@/core/network/apiClient'
import { asAPIError, apiErrorText, type APIError } from '@/core/network/apiError'
import type { HealthResponseDTO, LoginResponseDTO, RegisterResponseDTO } from '@/core/network/dto'
import { isHealthy } from '@/core/network/dto'
import { AuthRules, authErrorText, type AuthError } from '@/core/model/rules'

export interface UserSession {
  login: string
  server: string
  signedInAt: string
}

export type ServerStatus =
  | { kind: 'unknown' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'offline' }
  | { kind: 'failed'; reason: string }

export function serverStatusTitle(status: ServerStatus): string {
  switch (status.kind) {
    case 'unknown':
      return 'Соединение не проверено'
    case 'checking':
      return 'Проверяем соединение…'
    case 'available':
      return 'Сервер доступен'
    case 'offline':
      return 'Нет соединения'
    case 'failed':
      return status.reason
  }
}

export function serverStatusSymbol(status: ServerStatus): string {
  switch (status.kind) {
    case 'unknown':
      return 'questionmark.circle'
    case 'checking':
      return 'arrow.trianglehead.2.clockwise'
    case 'available':
      return 'checkmark.circle.fill'
    case 'offline':
      return 'wifi.slash'
    case 'failed':
      return 'exclamationmark.triangle.fill'
  }
}

export function authErrorFromAPI(error: APIError): AuthError {
  switch (error.kind) {
    case 'malformedServer':
      return { kind: 'malformedServer' }
    case 'unreachable':
      return { kind: 'serverUnreachable' }
    case 'decoding':
      return { kind: 'unknown', message: apiErrorText(error) }
    case 'status':
      switch (error.code) {
        case 'unknown_login':
          return { kind: 'unknownLogin' }
        case 'login_taken':
          return { kind: 'loginTaken' }
        case 'bad_request':
          return { kind: 'shortLogin' }
        case 'invalid_token':
          return { kind: 'unknownLogin' }
        default:
          return { kind: 'unknown', message: apiErrorText(error) }
      }
  }
}

const keys = {
  server: 'auth.server',
  login: 'auth.lastLogin',
  session: 'auth.session'
}

function readString(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
  }
}

export interface SessionStore {
  read(): UserSession | null
  write(session: UserSession): void
  clear(): void
}

export class LocalSessionStore implements SessionStore {
  read(): UserSession | null {
    try {
      const raw = localStorage.getItem(keys.session)
      return raw ? (JSON.parse(raw) as UserSession) : null
    } catch {
      return null
    }
  }

  write(session: UserSession): void {
    writeString(keys.session, JSON.stringify(session))
  }

  clear(): void {
    try {
      localStorage.removeItem(keys.session)
    } catch {
    }
  }
}

export class InMemorySessionStore implements SessionStore {
  constructor(private stored: UserSession | null = null) {}

  read(): UserSession | null {
    return this.stored
  }

  write(session: UserSession): void {
    this.stored = session
  }

  clear(): void {
    this.stored = null
  }
}

export class AuthStore {
  readonly server = ref('')
  readonly login = ref('')
  readonly session = ref<UserSession | null>(null)
  readonly serverStatus = ref<ServerStatus>({ kind: 'unknown' })
  readonly isBusy = ref(false)
  readonly error = ref<AuthError | null>(null)

  readonly isSignedIn = computed(() => this.session.value !== null)
  readonly canRegister = computed(() => this.error.value?.kind === 'unknownLogin' && !this.isBusy.value)

  constructor(private readonly sessions: SessionStore = new LocalSessionStore()) {
    this.server.value = readString(keys.server)
    this.login.value = readString(keys.login)

    const restored = this.sessions.read()
    if (restored) {
      this.session.value = restored
      this.server.value = restored.server
      this.login.value = restored.login
    }
  }

  setServer(value: string): void {
    if (this.server.value === value) return
    this.server.value = value
    writeString(keys.server, value)
    this.serverStatus.value = { kind: 'unknown' }
  }

  setLogin(value: string): void {
    if (this.login.value === value) return
    this.login.value = value
    writeString(keys.login, value)
  }

  async checkServer(): Promise<void> {
    if (this.serverStatus.value.kind === 'checking') return

    const validation = AuthRules.validateServer(this.server.value)
    if (validation) {
      this.serverStatus.value = { kind: 'failed', reason: authErrorText(validation) }
      return
    }

    this.serverStatus.value = { kind: 'checking' }
    this.serverStatus.value = await checkServerStatus(this.server.value)
  }

  async signIn(): Promise<void> {
    await this.open('auth/login')
  }

  async register(): Promise<void> {
    await this.open('auth/register')
  }

  private async open(path: string): Promise<void> {
    if (this.isBusy.value) return

    this.error.value = null
    this.isBusy.value = true

    try {
      const session = await openSession(this.server.value, this.login.value, path)
      this.setLogin(session.login)
      this.setServer(session.server)
      this.serverStatus.value = { kind: 'available' }
      this.session.value = session
      this.sessions.write(session)
    } catch (error) {
      const authError = error as AuthError
      this.error.value = authError
      if (authError.kind === 'serverUnreachable') this.serverStatus.value = { kind: 'offline' }
    } finally {
      this.isBusy.value = false
    }
  }

  signOut(): void {
    this.session.value = null
    this.error.value = null
    this.serverStatus.value = { kind: 'unknown' }
    this.sessions.clear()
  }

  sessionExpired(): void {
    this.session.value = null
    this.serverStatus.value = { kind: 'unknown' }
    this.sessions.clear()
  }
}

async function checkServerStatus(server: string): Promise<ServerStatus> {
  const normalized = AuthRules.normalizedServer(server)
  const client = normalized ? APIClient.create(normalized) : null
  if (!client) return { kind: 'failed', reason: 'Адрес сервера выглядит некорректно' }

  try {
    const response = await client.send({ path: 'health' })
    const health = client.tryDecode<HealthResponseDTO>(response.data)

    const success = response.status >= 200 && response.status < 300
    if (success && (health === null || isHealthy(health))) return { kind: 'available' }

    return { kind: 'failed', reason: 'Сервер отвечает, но база данных недоступна' }
  } catch (error) {
    const apiError = asAPIError(error)
    if (apiError?.kind === 'unreachable') return { kind: 'offline' }
    return { kind: 'failed', reason: apiError ? apiErrorText(apiError) : 'Не удалось проверить сервер' }
  }
}

async function openSession(server: string, login: string, path: string): Promise<UserSession> {
  const normalized = AuthRules.normalizedServer(server)
  const client = normalized ? APIClient.create(normalized) : null
  if (!client || !normalized) throw { kind: 'malformedServer' } satisfies AuthError

  const validation = AuthRules.validateLogin(login)
  if (validation) throw validation

  try {
    const response = await client.send({
      method: 'POST',
      path,
      body: { login: AuthRules.normalizedLogin(login) }
    })
    client.validate(response)

    const accepted =
      client.tryDecode<LoginResponseDTO>(response.data)?.login ??
      client.tryDecode<RegisterResponseDTO>(response.data)?.login ??
      AuthRules.normalizedLogin(login)

    return { login: accepted, server: normalized, signedInAt: new Date().toISOString() }
  } catch (error) {
    const apiError = asAPIError(error)
    if (apiError) throw authErrorFromAPI(apiError)
    throw { kind: 'unknown', message: error instanceof Error ? error.message : String(error) } satisfies AuthError
  }
}

export const authStore = new AuthStore()
