<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MainTabBar from './MainTabBar.vue'
import OperationFormScreen from '@/features/operations/OperationFormScreen.vue'
import { authStore as auth } from '@/features/auth/authStore'
import { exportStore as exports } from '@/features/export/exportStore'
import { syncStore as sync } from '@/features/sync/syncStore'
import { ledgerStore as ledger } from '@/core/store/ledgerStore'
import { mainTabs, tabPath, type MainTab } from './tabs'

const route = useRoute()
const router = useRouter()

const isCreating = ref(false)

const selection = computed<MainTab>(() => {
  const name = route.path.replace('/', '')
  return (mainTabs as string[]).includes(name) ? (name as MainTab) : 'operations'
})

function select(tab: MainTab): void {
  void router.replace(tabPath(tab))
}

async function syncAutomatically(): Promise<void> {
  await sync.syncAutomatically(ledger, auth.session.value)
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') void syncAutomatically()
}

onMounted(async () => {
  await ledger.loadIfNeeded()
  await syncAutomatically()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

watch(
  () => sync.sessionExpired.value,
  (expired) => {
    if (!expired) return
    auth.sessionExpired()
    sync.acknowledgeSessionExpiry()
  }
)

watch(
  () => exports.sessionExpired.value,
  (expired) => {
    if (!expired) return
    auth.sessionExpired()
    exports.acknowledgeSessionExpiry()
  }
)
</script>

<template>
  <div class="shell">
    <main class="shell__content">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>

    <div class="shell__bar">
      <MainTabBar :selection="selection" @select="select" @create="isCreating = true" />
    </div>

    <OperationFormScreen v-if="isCreating" @close="isCreating = false" />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.shell__content {
  flex: 1 1 auto;
  padding-bottom: calc(var(--tab-bar-height) + env(safe-area-inset-bottom) + var(--space-l));
}

.shell__bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  pointer-events: none;
}

.shell__bar > :deep(*) {
  pointer-events: auto;
}
</style>
