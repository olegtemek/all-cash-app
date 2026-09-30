import { appLocale } from '@/core/model/locale'
import { en } from './en'
import { ru, type MessageKey } from './ru'

export type { MessageKey }

const catalogs: Record<string, Record<string, string>> = { ru, en }
const catalog = catalogs[appLocale] ?? ru

const pluralRules = new Intl.PluralRules(appLocale === 'ru' ? 'ru-RU' : 'en-US')

function fill(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return fill(catalog[key] ?? ru[key], params)
}

// Множественное число: ключи `<base>.one|few|many|other`. Нет формы — берётся `other`, затем `many`.
export function plural(base: string, count: number): string {
  const category = pluralRules.select(count)
  const key = [`${base}.${category}`, `${base}.other`, `${base}.many`].find((item) => item in catalog)
  return fill(key ? (catalog[key] as string) : base, { count })
}
