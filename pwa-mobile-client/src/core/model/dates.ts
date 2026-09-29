import { interfaceLocale } from './locale'

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isSameDay(left: Date, right: Date): boolean {
  return startOfDay(left).getTime() === startOfDay(right).getTime()
}

export function isToday(date: Date, now: Date = new Date()): boolean {
  return isSameDay(date, now)
}

export function isYesterday(date: Date, now: Date = new Date()): boolean {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return isSameDay(date, yesterday)
}

export function dayTitle(day: Date, now: Date = new Date()): string {
  if (isToday(day, now)) return 'Сегодня'
  if (isYesterday(day, now)) return 'Вчера'

  const sameYear = day.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(interfaceLocale, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' })
  }).format(day)
}

export function fullDate(date: Date): string {
  return new Intl.DateTimeFormat(interfaceLocale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export function dayMonth(date: Date): string {
  return new Intl.DateTimeFormat(interfaceLocale, { day: 'numeric', month: 'long' }).format(date)
}

export function shortDateTime(date: Date): string {
  return new Intl.DateTimeFormat(interfaceLocale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function toDateInputValue(iso: string): string {
  const date = new Date(iso)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function fromDateInputValue(raw: string, previous?: string): string {
  const [year, month, day] = raw.split('-').map(Number)
  if (!year || !month || !day) return previous ?? new Date().toISOString()

  const base = previous ? new Date(previous) : new Date()
  const result = new Date(year, month - 1, day, base.getHours(), base.getMinutes(), base.getSeconds())
  return result.toISOString()
}

export function formatFileSize(bytes: number): string {
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const formatted = new Intl.NumberFormat(interfaceLocale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)
  return `${formatted} ${units[unit]}`
}
