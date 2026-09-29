import { rounded } from '../model/decimal'

export const APIFormat = {
  stringFromDate(date: Date | string): string {
    const value = typeof date === 'string' ? new Date(date) : date
    return value.toISOString()
  },

  dateFromString(raw: string): string | null {
    const value = new Date(raw)
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  },

  stringFromDecimal(amount: number): string {
    return rounded(amount).toFixed(2)
  },

  decimalFromString(raw: string): number | null {
    const value = Number(raw.trim())
    return Number.isFinite(value) ? rounded(value) : null
  },

  stringFromUUID(id: string): string {
    return id.toLowerCase()
  },

  uuidFromString(raw: string): string | null {
    const value = raw.trim().toLowerCase()
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value) ? value : null
  }
}
