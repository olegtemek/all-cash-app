<script setup lang="ts">
import { computed } from 'vue'
import { iconFor } from './icons'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    strokeWidth?: number
  }>(),
  { size: 18, strokeWidth: 2 }
)

const icon = computed(() => iconFor(props.name))
</script>

<template>
  <component
    :is="icon"
    :size="props.size"
    :stroke-width="props.strokeWidth"
    aria-hidden="true"
    focusable="false"
  />
</template>
