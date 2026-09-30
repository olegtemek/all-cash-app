export type AppLocale = 'ru' | 'en'

export const supportedLocales: AppLocale[] = ['ru', 'en']

const storageKey = 'ui.locale'

function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === 'ru' || value === 'en'
}

function storedLocale(): AppLocale | null {
  try {
    const value = localStorage.getItem(storageKey)
    return isAppLocale(value) ? value : null
  } catch {
    return null
  }
}

function detectedLocale(): AppLocale {
  const preferred = navigator.languages ?? [navigator.language]
  for (const tag of preferred) {
    const base = tag.split('-')[0]?.toLowerCase()
    if (isAppLocale(base)) return base
  }
  return 'ru'
}

// Язык фиксируется при загрузке. Смена языка сохраняет выбор и перезагружает страницу (ADR-0002).
export const appLocale: AppLocale = storedLocale() ?? detectedLocale()

export function setStoredLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(storageKey, locale)
  } catch {
    // Без хранилища выбор не сохранится, язык останется прежним.
  }
}

export const interfaceLocale: string = appLocale === 'ru' ? 'ru-RU' : 'en-US'

export const decimalSeparator: string =
  new Intl.NumberFormat(interfaceLocale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? ','
