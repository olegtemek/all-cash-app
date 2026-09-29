<script setup lang="ts">
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ kind?: 'error' | 'info'; text: string }>(), { kind: 'info' })
</script>

<template>
  <p class="message" :class="`message--${props.kind}`">
    <AppIcon :name="props.kind === 'error' ? 'exclamationmark.triangle.fill' : 'info.circle.fill'" :size="14" />
    <span>{{ props.text }}</span>
  </p>
</template>

<style scoped>
.message {
  display: flex;
  align-items: flex-start;
  gap: var(--space-s);
  margin: 0;
  padding: 0 var(--space-l);
  font-size: 13px;
  line-height: 1.4;
}

.message :deep(svg) {
  flex: 0 0 auto;
  margin-top: 2px;
}

.message--error {
  color: var(--danger);
}

.message--info {
  color: var(--label-secondary);
}
</style>
