<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/design/AppIcon.vue'
import SpinnerDot from '@/design/SpinnerDot.vue'
import { serverStatusSymbol, serverStatusTitle, type ServerStatus } from './authStore'

const props = defineProps<{ status: ServerStatus; isEnabled: boolean }>()
const emit = defineEmits<{ check: [] }>()

const tone = computed(() => {
  switch (props.status.kind) {
    case 'available':
      return 'status--available'
    case 'offline':
    case 'failed':
      return 'status--warning'
    default:
      return 'status--neutral'
  }
})

const canCheck = computed(() => props.isEnabled && props.status.kind !== 'checking')
</script>

<template>
  <div class="status" :aria-label="`Состояние сервера: ${serverStatusTitle(status)}`">
    <span class="status__icon" :class="tone">
      <SpinnerDot v-if="status.kind === 'checking'" />
      <AppIcon v-else :name="serverStatusSymbol(status)" :size="16" />
    </span>

    <span class="status__title text-subheadline" :class="{ secondary: status.kind !== 'available' }">
      {{ serverStatusTitle(status) }}
    </span>

    <button type="button" class="status__check text-subheadline" :disabled="!canCheck" @click="emit('check')">
      Проверить
    </button>
  </div>
</template>

<style scoped>
.status {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  min-height: 52px;
  padding: var(--space-m) var(--space-l);
  background: var(--field-background);
}

.status__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
}

.status--available {
  color: var(--success);
}

.status--warning {
  color: var(--warning);
}

.status--neutral {
  color: var(--label-secondary);
}

.status__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status__check {
  flex: 0 0 auto;
  color: var(--accent);
  font-weight: 500;
}

.status__check:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
