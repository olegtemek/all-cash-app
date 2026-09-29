export type MainTab = 'operations' | 'accounts' | 'analytics' | 'settings'

export const mainTabs: MainTab[] = ['operations', 'accounts', 'analytics', 'settings']

export function tabTitle(tab: MainTab): string {
  switch (tab) {
    case 'operations':
      return 'Операции'
    case 'accounts':
      return 'Счета'
    case 'analytics':
      return 'Аналитика'
    case 'settings':
      return 'Настройки'
  }
}

export function tabSymbol(tab: MainTab): string {
  switch (tab) {
    case 'operations':
      return 'list.bullet.rectangle.portrait'
    case 'accounts':
      return 'creditcard'
    case 'analytics':
      return 'chart.pie'
    case 'settings':
      return 'gearshape'
  }
}

export function tabPath(tab: MainTab): string {
  return `/${tab}`
}
