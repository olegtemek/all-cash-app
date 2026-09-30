<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

// Single-line text that keeps its end visible when it overflows: keypad input
// grows to the right, so the latest digit must stay in view.
const props = defineProps<{ text: string }>()

const element = ref<HTMLElement | null>(null)

function scrollToEnd(): void {
  const node = element.value
  if (node) node.scrollLeft = node.scrollWidth
}

onMounted(scrollToEnd)
watch(
  () => props.text,
  () => nextTick(scrollToEnd)
)
</script>

<template>
  <span ref="element" class="trailing">{{ text }}</span>
</template>

<style scoped>
.trailing {
  display: block;
  min-width: 0;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
}

.trailing::-webkit-scrollbar {
  display: none;
}
</style>
