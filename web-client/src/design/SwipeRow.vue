<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'

import type { SwipeAction } from './swipeAction'

const props = defineProps<{ actions: SwipeAction[] }>()
const emit = defineEmits<{ action: [string]; press: [] }>()

const offset = ref(0)
const startX = ref<number | null>(null)
const startY = ref<number | null>(null)
const isDragging = ref(false)

const actionWidth = 84
const maxOffset = computed(() => props.actions.length * actionWidth)

function onTouchStart(event: TouchEvent): void {
  const touch = event.touches[0]
  if (!touch) return
  startX.value = touch.clientX + offset.value
  startY.value = touch.clientY
}

function onTouchMove(event: TouchEvent): void {
  const touch = event.touches[0]
  if (!touch || startX.value === null || startY.value === null) return

  if (!isDragging.value && Math.abs(touch.clientY - startY.value) > 12) {
    startX.value = null
    return
  }

  const next = startX.value - touch.clientX
  if (!isDragging.value && Math.abs(next - offset.value) < 6) return

  isDragging.value = true
  offset.value = Math.min(Math.max(next, 0), maxOffset.value)
}

function onTouchEnd(): void {
  if (!isDragging.value) {
    startX.value = null
    return
  }

  offset.value = offset.value > maxOffset.value / 2 ? maxOffset.value : 0
  startX.value = null
  isDragging.value = false
}

function close(): void {
  offset.value = 0
}

function run(id: string): void {
  close()
  emit('action', id)
}

function onClick(): void {
  if (offset.value > 0) {
    close()
    return
  }
  emit('press')
}

defineExpose({ close })
</script>

<template>
  <div class="swipe">
    <div class="swipe__actions" :style="{ width: `${maxOffset}px` }">
      <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="swipe__action"
        :class="`swipe__action--${action.tone}`"
        @click="run(action.id)"
      >
        <AppIcon :name="action.symbol" :size="18" />
        <span class="text-caption">{{ action.title }}</span>
      </button>
    </div>

    <div
      class="swipe__content"
      :class="{ 'swipe__content--dragging': isDragging }"
      :style="{ transform: `translateX(-${offset}px)` }"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
      @click="onClick"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.swipe {
  position: relative;
  overflow: hidden;
  background: var(--field-background);
}

.swipe__actions {
  position: absolute;
  inset: 0 0 0 auto;
  display: flex;
}

.swipe__action {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: #fff;
}

.swipe__action--danger {
  background: var(--danger);
}

.swipe__action--accent {
  background: var(--accent);
}

.swipe__action--warning {
  background: var(--warning);
}

.swipe__content {
  position: relative;
  background: var(--field-background);
  transition: transform var(--duration-control) var(--ease-control);
  cursor: pointer;
}

.swipe__content--dragging {
  transition: none;
}
</style>
