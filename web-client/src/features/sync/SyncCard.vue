<script setup lang="ts">
import { computed } from 'vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import InlineMessage from '@/design/InlineMessage.vue'
import SpinnerDot from '@/design/SpinnerDot.vue'
import ServerStatusRow from '@/features/auth/ServerStatusRow.vue'
import { authStore as auth } from '@/features/auth/authStore'
import { syncStore as sync } from './syncStore'
import { shortDateTime } from '@/core/model/dates'
import { ledgerStore as ledger } from '@/core/store/ledgerStore'

const isOffline = computed(() => auth.serverStatus.value.kind === 'offline')

const canSync = computed(() => !sync.isSyncing.value && !isOffline.value && auth.session.value !== null)

const stateTitle = computed(() => {
  if (sync.isSyncing.value) return 'Идёт синхронизация…'
  const pending = ledger.pendingCount.value
  return pending === 0 ? 'Все записи выгружены' : `Не выгружено: ${pending}`
})

const stateSymbol = computed(() => {
  if (sync.isSyncing.value) return 'arrow.trianglehead.2.clockwise'
  return ledger.pendingCount.value === 0 ? 'checkmark.icloud' : 'icloud.and.arrow.up'
})

const lastSyncTitle = computed(() => {
  const date = sync.lastSyncedDate.value
  return date ? shortDateTime(date) : 'Ещё не выгружалось'
})

async function run(): Promise<void> {
  await sync.sync(ledger, auth.session.value)
  if (sync.error.value !== null) await auth.checkServer()
}
</script>

<template>
  <div class="card">
    <FormCard title="Синхронизация">
      <ServerStatusRow
        :status="auth.serverStatus.value"
        :is-enabled="!sync.isSyncing.value"
        @check="auth.checkServer()"
      />

      <FormDivider />

      <FieldRow :symbol="stateSymbol">
        <span>Состояние</span>
        <span class="card__value secondary">{{ stateTitle }}</span>
      </FieldRow>

      <FormDivider />

      <FieldRow symbol="clock.arrow.circlepath">
        <span>Последняя выгрузка</span>
        <span class="card__value secondary">{{ lastSyncTitle }}</span>
      </FieldRow>

      <FormDivider />

      <FieldRow symbol="icloud.and.arrow.up" as="button" :is-active="canSync" :disabled="!canSync" @click="run">
        <span :class="canSync ? 'card__accent' : 'secondary'">Синхронизировать</span>
        <span v-if="sync.isSyncing.value" class="card__value">
          <SpinnerDot />
        </span>
      </FieldRow>
    </FormCard>

    <InlineMessage v-if="sync.error.value" kind="error" :text="sync.error.value" />
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.card__value {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__accent {
  color: var(--accent);
}
</style>
