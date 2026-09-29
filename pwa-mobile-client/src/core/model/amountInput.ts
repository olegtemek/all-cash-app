import { rounded } from './decimal'

export function decimalFromText(text: string): number | null {
  const cleaned = text
    .replace(/ /g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '.')

  if (cleaned.length === 0) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  return rounded(value)
}

export { rounded }
