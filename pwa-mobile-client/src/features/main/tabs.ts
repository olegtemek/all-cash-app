import { t } from '@/core/i18n'
export type MainTab = 'operations' | 'accounts' | 'analytics' | 'settings'

export const mainTabs: MainTab[] = ['operations', 'accounts', 'analytics', 'settings']

export function tabTitle(tab: MainTab): string {
  switch (tab) {
    case 'operations':
      return t('tabs.operations')
    case 'accounts':
      return t('tabs.accounts')
    case 'analytics':
      return t('tabs.analytics')
    case 'settings':
      return t('tabs.settings')
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
