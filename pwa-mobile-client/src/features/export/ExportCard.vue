<script setup lang="ts">
import { t } from '@/core/i18n'
import { ref } from 'vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import InlineMessage from '@/design/InlineMessage.vue'
import SpinnerDot from '@/design/SpinnerDot.vue'
import { exportStore as store } from './exportStore'

const input = ref<HTMLInputElement | null>(null)

async function picked(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (file) await store.importBackup(file)
}
</script>

<template>
  <div class="card">
    <FormCard :title="t('export.title')">
      <FieldRow symbol="square.and.arrow.down" as="button" @click="store.exportBackup()">
        <span class="card__accent">{{ t('export.backup') }}</span>
      </FieldRow>

      <FormDivider />

      <FieldRow symbol="square.and.arrow.up" as="button" :disabled="store.isBusy.value" @click="input?.click()">
        <span :class="store.isBusy.value ? 'secondary' : 'card__accent'">{{ t('export.import') }}</span>
        <span v-if="store.isBusy.value" class="card__trailing">
          <SpinnerDot />
        </span>
      </FieldRow>

      <FormDivider />

      <FieldRow symbol="square.and.arrow.down" as="button" @click="store.exportCSV()">
        <span class="card__accent">{{ t('export.csv') }}</span>
      </FieldRow>
    </FormCard>

    <input ref="input" class="card__input" type="file" accept=".json,application/json" @change="picked" />

    <InlineMessage v-if="store.error.value" kind="error" :text="store.error.value" />
    <InlineMessage v-else-if="store.message.value" kind="info" :text="store.message.value" />
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

.card__trailing {
  margin-left: auto;
}

.card__input {
  display: none;
}
</style>
