<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import SpinnerDot from './SpinnerDot.vue'

const emit = defineEmits<{ visible: [] }>()

const element = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      emit('visible')
      void recheck()
    },
    { rootMargin: '600px 0px' }
  )
  if (element.value) observer.observe(element.value)
})

// IntersectionObserver reports only changes. When the next page is too short to push
// the sentinel out of view, re-observing produces a fresh entry and loads one more page.
async function recheck(): Promise<void> {
  await nextTick()
  const target = element.value
  if (!observer || !target) return
  observer.unobserve(target)
  observer.observe(target)
}

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="element" class="sentinel">
    <SpinnerDot />
  </div>
</template>

<style scoped>
.sentinel {
  display: flex;
  justify-content: center;
  padding: var(--space-m) 0;
}
</style>
