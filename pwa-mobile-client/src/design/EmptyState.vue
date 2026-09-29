<script setup lang="ts">
import AppIcon from './AppIcon.vue'

defineProps<{ title: string; symbol: string; description?: string }>()
</script>

<template>
  <div class="empty">
    <AppIcon :name="symbol" :size="42" :stroke-width="1.5" />
    <p class="empty__title text-headline">{{ title }}</p>
    <p v-if="description" class="empty__description text-subheadline secondary">{{ description }}</p>
    <div v-if="$slots.actions" class="empty__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-s);
  padding: var(--space-xxl) var(--space-xl);
  text-align: center;
  color: var(--label-secondary);
  min-height: 240px;
}

.empty__title {
  margin: var(--space-s) 0 0;
  color: var(--label);
}

.empty__description {
  margin: 0;
  max-width: 34ch;
}

.empty__actions {
  margin-top: var(--space-m);
}
</style>
