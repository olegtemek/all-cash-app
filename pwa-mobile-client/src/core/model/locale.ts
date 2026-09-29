export const interfaceLocale: string = (() => {
  const preferred = navigator.languages ?? [navigator.language]
  const supported = ['ru', 'en']
  for (const tag of preferred) {
    const base = tag.split('-')[0]?.toLowerCase()
    if (base && supported.includes(base)) return base === 'ru' ? 'ru-RU' : 'en-US'
  }
  return 'ru-RU'
})()

export const decimalSeparator: string =
  new Intl.NumberFormat(interfaceLocale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? ','
