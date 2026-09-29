
export interface AccountDTO {
  id: string
  name: string
  currency: string
  initialBalance: string
  isArchived: boolean
  isHidden: boolean
  deletedAt: string | null
  seq?: number | null
}

export interface CategoryDTO {
  id: string
  name: string
  kind: string
  symbolName: string
  color: string
  deletedAt: string | null
  seq?: number | null
}

export interface OperationDTO {
  id: string
  date: string
  createdAt: string
  note: string | null
  kind: string
  accountId: string
  amount: string
  currency: string
  categoryId: string | null
  counterparty: string | null
  debtDirection: string | null
  debtId: string | null
  destinationAccountId: string | null
  destinationAmount: string | null
  destinationCurrency: string | null
  deletedAt: string | null
  seq?: number | null
}

export interface PullResponseDTO {
  nextSeq: number
  serverSeq?: number
  hasMore: boolean
  accounts: AccountDTO[]
  categories: CategoryDTO[]
  operations: OperationDTO[]
}

export interface PushRequestDTO {
  accounts: AccountDTO[]
  categories: CategoryDTO[]
  operations: OperationDTO[]
}

export interface PushResponseDTO {
  accepted?: Record<string, number>
  rejected?: Record<string, string>
  finishedAt?: string | null
}

export interface HealthResponseDTO {
  status: string
  time?: string | null
  database?: string | null
}

export function isHealthy(dto: HealthResponseDTO): boolean {
  return dto.status === 'ok' && dto.database !== 'down'
}

export interface LoginRequestDTO {
  login: string
}

export interface LoginResponseDTO {
  login: string
}

export interface RegisterResponseDTO {
  userId: string
  login: string
}
