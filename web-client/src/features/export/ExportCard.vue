<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/design/AppIcon.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import InlineMessage from '@/design/InlineMessage.vue'
import SpinnerDot from '@/design/SpinnerDot.vue'
import { authStore as auth } from '@/features/auth/authStore'
import { exportStore as store } from './exportStore'
import { formatFileSize, shortDateTime } from '@/core/model/dates'

const isConnected = computed(() => auth.serverStatus.value.kind === 'available')

const canRequest = computed(() => !store.isLoading.value && isConnected.value && auth.session.value !== null)

const file = computed(() => store.file.value)

const fileDetails = computed(() => {
  const current = file.value
  if (!current) return ''
  return `${current.name} · ${formatFileSize(current.size)} · ${shortDateTime(new Date(current.receivedAt))}`
})
</script>

<template>
  <div class="card">
    <FormCard title="Выгрузка данных">
      <FieldRow
        symbol="square.and.arrow.down"
        as="button"
        :is-active="canRequest"
        :disabled="!canRequest"
        @click="store.export(auth.session.value)"
      >
        <span :class="canRequest ? 'card__accent' : 'secondary'">
          {{ file ? 'Обновить выгрузку' : 'Выгрузить в CSV' }}
        </span>
        <span v-if="store.isLoading.value" class="card__trailing">
          <SpinnerDot />
        </span>
      </FieldRow>

      <template v-if="file">
        <FormDivider />

        <a class="card__download" :href="file.url" :download="file.name">
          <FieldRow symbol="square.and.arrow.up">
            <span class="card__file">
              <span class="card__accent">Скачать файл</span>
              <span class="text-footnote secondary">{{ fileDetails }}</span>
            </span>
          </FieldRow>
        </a>

        <FormDivider />

        <FieldRow symbol="trash" as="button" @click="store.discardFile()">
          <span class="card__danger">Удалить выгрузку</span>
          <template #accessory>
            <AppIcon name="xmark" :size="14" />
          </template>
        </FieldRow>
      </template>
    </FormCard>

    <InlineMessage v-if="store.error.value" kind="error" :text="store.error.value" />
    <InlineMessage v-else kind="info" text="Файл со всеми операциями в формате CSV готовит сервер" />
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.card__accent {
  color: var(--accent);
}

.card__danger {
  color: var(--danger);
}

.card__trailing {
  margin-left: auto;
}

.card__file {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.card__file > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__download {
  display: block;
  color: inherit;
}
</style>
