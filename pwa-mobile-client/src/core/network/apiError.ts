export type APIErrorCode =
  | 'bad_request'
  | 'unknown_login'
  | 'invalid_token'
  | 'payload_too_large'
  | 'schema_error'
  | 'login_taken'
  | 'internal_error'

export type APIError =
  | { kind: 'malformedServer' }
  | { kind: 'unreachable' }
  | { kind: 'status'; status: number; code: string; message: string }
  | { kind: 'decoding'; details: string }

export function apiErrorCode(error: APIError): APIErrorCode | null {
  return error.kind === 'status' ? (error.code as APIErrorCode) : null
}

export function isSessionExpired(error: APIError): boolean {
  return apiErrorCode(error) === 'invalid_token'
}

export function apiErrorText(error: APIError): string {
  switch (error.kind) {
    case 'malformedServer':
      return 'Адрес сервера выглядит некорректно'
    case 'unreachable':
      return 'Сервер недоступен. Проверьте адрес и соединение'
    case 'status':
      return error.message.length > 0 ? error.message : `Сервер ответил ошибкой ${error.status}`
    case 'decoding':
      return `Сервер вернул неожиданный ответ: ${error.details}`
  }
}

export class APIFailure extends Error {
  constructor(public readonly error: APIError) {
    super(apiErrorText(error))
    this.name = 'APIFailure'
  }
}

export function asAPIError(error: unknown): APIError | null {
  return error instanceof APIFailure ? error.error : null
}
