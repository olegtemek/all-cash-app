<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConfirmDialog from '@/design/ConfirmDialog.vue'
import EmptyState from '@/design/EmptyState.vue'
import LoadingView from '@/design/LoadingView.vue'
import ScreenHeader from '@/design/ScreenHeader.vue'
import SwipeRow from '@/design/SwipeRow.vue'
import type { SwipeAction } from '@/design/swipeAction'
import AppButton from '@/design/AppButton.vue'
import OperationRow from './OperationRow.vue'
import OperationDetailSheet from './OperationDetailSheet.vue'
import OperationFormScreen from './OperationFormScreen.vue'
import { deletionWarning } from './deletionWarning'
import { ledgerStore as store } from '@/core/store/ledgerStore'
import type { OperationRowModel } from '@/core/store/models'

const pendingDeletion = ref<OperationRowModel | null>(null)
const editingID = ref<string | null>(null)
const selectedID = ref<string | null>(null)

const phase = store.phase
const days = store.days

const deletionMessage = computed(() =>
  pendingDeletion.value ? deletionWarning(pendingDeletion.value.id, store, pendingDeletion.value.title) : ''
)

const actionError = store.actionError

onMounted(() => {
  void store.loadIfNeeded()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') store.refreshDayTitles()
}

function actionsFor(row: OperationRowModel): SwipeAction[] {
  const actions: SwipeAction[] = [{ id: 'delete', title: 'Удалить', symbol: 'trash', tone: 'danger' }]
  if (row.isEditable) actions.push({ id: 'edit', title: 'Изменить', symbol: 'pencil', tone: 'accent' })
  return actions
}

function handleAction(row: OperationRowModel, action: string): void {
  if (action === 'delete') pendingDeletion.value = row
  if (action === 'edit') editingID.value = row.id
}

async function confirmDeletion(): Promise<void> {
  const row = pendingDeletion.value
  pendingDeletion.value = null
  if (row) await store.deleteOperation(row.id)
}
</script>

<template>
  <div class="screen">
    <ScreenHeader title="Операции" />

    <LoadingView v-if="phase.kind === 'loading'" />

    <EmptyState
      v-else-if="phase.kind === 'failed'"
      title="Лента не открылась"
      symbol="exclamationmark.triangle"
      :description="phase.message"
    >
      <template #actions>
        <AppButton @click="store.load()">Повторить</AppButton>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="!store.hasOperations.value"
      title="Пока нет операций"
      symbol="tray"
      description="Нажмите кнопку с плюсом, чтобы записать первую."
    />

    <div v-else class="list">
      <section v-for="day in days" :key="day.id" class="list__section">
        <h2 class="list__title text-subheadline">{{ day.title }}</h2>

        <div class="list__card">
          <SwipeRow
            v-for="row in day.rows"
            :key="row.id"
            :actions="actionsFor(row)"
            @action="handleAction(row, $event)"
            @press="selectedID = row.id"
          >
            <OperationRow :model="row" />
          </SwipeRow>
        </div>
      </section>
    </div>

    <OperationDetailSheet
      v-if="selectedID"
      :operation-id="selectedID"
      @close="selectedID = null"
      @edit="
        (id) => {
          selectedID = null
          editingID = id
        }
      "
    />

    <OperationFormScreen v-if="editingID" :editing-id="editingID" @close="editingID = null" />

    <ConfirmDialog
      :open="pendingDeletion !== null"
      title="Удалить операцию?"
      :message="deletionMessage"
      @confirm="confirmDeletion"
      @cancel="pendingDeletion = null"
    />

    <ConfirmDialog
      :open="actionError !== null"
      title="Не удалось удалить"
      :message="actionError ?? ''"
      confirm-title="Понятно"
      cancel-title="Закрыть"
      :destructive="false"
      @confirm="actionError = null"
      @cancel="actionError = null"
    />
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
  padding: 0 var(--space-l) var(--space-xl);
}

.list__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.list__title {
  margin: 0;
  padding: 0 var(--space-xs);
  font-weight: 600;
}

.list__card {
  background: var(--field-background);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.list__card > :deep(.swipe + .swipe) .swipe__content {
  box-shadow: inset 0 1px 0 var(--separator);
}
</style>
