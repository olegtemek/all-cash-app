<script setup lang="ts" generic="T extends string | number">
const props = defineProps<{
  label: string
  options: { value: T; title: string }[]
  modelValue: T
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [T] }>()

function select(value: T): void {
  if (props.disabled) return
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="segments" role="tablist" :aria-label="label">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      role="tab"
      class="segments__item"
      :class="{ 'segments__item--selected': option.value === modelValue }"
      :aria-selected="option.value === modelValue"
      :disabled="disabled"
      @click="select(option.value)"
    >
      {{ option.title }}
    </button>
  </div>
</template>

<style scoped>
.segments {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: var(--fill-tertiary);
}

.segments__item {
  flex: 1 1 0;
  padding: 7px var(--space-s);
  border-radius: 8px;
  font-size: 15px;
  color: var(--label);
  transition: background var(--duration-control) var(--ease-control), color var(--duration-control) var(--ease-control);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.segments__item--selected {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.segments__item:disabled {
  opacity: 0.5;
}
</style>
