<script setup lang="ts">
import { ref } from 'vue'
import ConfirmDialog from '@/design/ConfirmDialog.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import InlineMessage from '@/design/InlineMessage.vue'
import SpinnerDot from '@/design/SpinnerDot.vue'
import { ledgerStore as ledger } from '@/core/store/ledgerStore'
import { syncStore as sync } from '@/features/sync/syncStore'

const isConfirming = ref(false)
const isErasing = ref(false)

async function erase(): Promise<void> {
  isConfirming.value = false
  if (isErasing.value) return

  isErasing.value = true
  await ledger.eraseAll()
  sync.resetState()
  isErasing.value = false
}
</script>

<template>
  <div class="card">
    <FormCard title="Данные">
      <FieldRow symbol="trash" as="button" :disabled="isErasing" @click="isConfirming = true">
        <span :class="isErasing ? 'secondary' : 'card__danger'">Очистить локальные данные</span>
        <span v-if="isErasing" class="card__trailing">
          <SpinnerDot />
        </span>
      </FieldRow>
    </FormCard>

    <InlineMessage
      kind="info"
      text="Удалит счета и операции только на этом устройстве и сбросит курсор синхронизации. Очистите таблицы на сервере отдельно."
    />
  </div>

  <ConfirmDialog
    :open="isConfirming"
    title="Очистить данные на устройстве?"
    message="Счета, категории и операции будут удалены без возможности восстановления."
    confirm-title="Очистить"
    @confirm="erase"
    @cancel="isConfirming = false"
  />
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.card__danger {
  color: var(--danger);
}

.card__trailing {
  margin-left: auto;
}
</style>
