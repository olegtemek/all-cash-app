import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import AccountsView from '@/features/accounts/AccountsView.vue'
import AnalyticsView from '@/features/analytics/AnalyticsView.vue'
import OperationsView from '@/features/operations/OperationsView.vue'
import SettingsView from '@/features/main/SettingsView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/operations' },
  { path: '/operations', name: 'operations', component: OperationsView },
  { path: '/accounts', name: 'accounts', component: AccountsView },
  { path: '/analytics', name: 'analytics', component: AnalyticsView },
  { path: '/settings', name: 'settings', component: SettingsView },
  { path: '/:pathMatch(.*)*', redirect: '/operations' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})
