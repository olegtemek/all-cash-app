<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(
  defineProps<{
    symbol: string
    isActive?: boolean
    as?: 'div' | 'button' | 'label'
    disabled?: boolean
  }>(),
  { isActive: false, as: 'div', disabled: false }
)
</script>

<template>
  <component :is="as" class="row" :class="{ 'row--button': as === 'button' }" :disabled="as === 'button' ? disabled : undefined">
    <span class="row__badge" :class="{ 'row__badge--active': isActive }">
      <AppIcon :name="symbol" :size="16" />
    </span>

    <span class="row__content">
      <slot />
    </span>

    <span class="row__accessory">
      <slot name="accessory" />
    </span>
  </component>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  width: 100%;
  min-height: 56px;
  padding: var(--space-m) var(--space-l);
  background: var(--field-background);
  text-align: left;
}

.row--button:disabled {
  opacity: 0.55;
  cursor: default;
}

.row__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-icon);
  background: var(--fill-tertiary);
  color: var(--label-secondary);
  transition: background var(--duration-control) var(--ease-control), color var(--duration-control) var(--ease-control);
}

.row__badge--active {
  background: var(--accent);
  color: #fff;
}

.row__content {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  gap: var(--space-m);
}

.row__accessory {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  color: var(--label-tertiary);
}
</style>
