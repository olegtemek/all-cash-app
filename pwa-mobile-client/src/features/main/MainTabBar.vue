<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@/design/AppIcon.vue'
import { mainTabs, tabSymbol, tabTitle, type MainTab } from './tabs'

const props = defineProps<{ selection: MainTab }>()
const emit = defineEmits<{ select: [MainTab]; create: [] }>()

const group = ref<HTMLElement | null>(null)
const items = ref<HTMLElement[]>([])

const restX = ref(0)
const restY = ref(0)
const size = ref({ w: 0, h: 0 })

const dragging = ref(false)
const dx = ref(0)
let startX = 0

function measure(): void {
  const el = items.value[mainTabs.indexOf(props.selection)]
  if (!el) return
  restX.value = el.offsetLeft
  restY.value = el.offsetTop
  size.value = { w: el.offsetWidth, h: el.offsetHeight }
}

function nearestIndex(): number {
  const centre = restX.value + dx.value + size.value.w / 2
  let best = 0
  let bestDistance = Infinity
  items.value.forEach((el, index) => {
    const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centre)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

const hoverTab = computed<MainTab>(() => (dragging.value ? mainTabs[nearestIndex()] : props.selection))

const bubbleStyle = computed(() => ({
  width: `${size.value.w}px`,
  height: `${size.value.h}px`,
  transform: `translate(${restX.value + dx.value}px, ${restY.value}px) scale(${dragging.value ? 1.1 : 1})`
}))

function onDown(event: PointerEvent): void {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  startX = event.clientX
  dx.value = 0
}

function onMove(event: PointerEvent): void {
  if (!dragging.value) return
  const first = items.value[0]
  const last = items.value[items.value.length - 1]
  if (!first || !last) return
  const min = first.offsetLeft - restX.value
  const max = last.offsetLeft - restX.value
  dx.value = Math.min(max, Math.max(min, event.clientX - startX))
}

function onUp(): void {
  if (!dragging.value) return
  const target = mainTabs[nearestIndex()]
  dragging.value = false
  dx.value = 0
  if (target !== props.selection) emit('select', target)
}

watch(() => props.selection, () => nextTick(measure))
onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onUnmounted(() => window.removeEventListener('resize', measure))
</script>

<template>
  <nav class="bar" aria-label="Разделы">
    <div ref="group" class="bar__group liquid-glass">
      <div
        class="bar__bubble liquid-glass liquid-glass--control"
        :class="{ 'bar__bubble--dragging': dragging }"
        :style="bubbleStyle"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <AppIcon :name="tabSymbol(hoverTab)" :size="23" :stroke-width="2.4" />
      </div>
      <button
        v-for="tab in mainTabs"
        :key="tab"
        ref="items"
        type="button"
        class="bar__item"
        :class="{ 'bar__item--selected': tab === selection }"
        :aria-label="tabTitle(tab)"
        :aria-current="tab === selection ? 'page' : undefined"
        @click="emit('select', tab)"
      >
        <AppIcon :name="tabSymbol(tab)" :size="23" :stroke-width="1.8" />
      </button>
    </div>

    <button
      type="button"
      class="bar__create liquid-glass liquid-glass--control liquid-glass--accent"
      aria-label="Новая операция"
      @click="emit('create')"
    >
      <AppIcon name="plus" :size="24" :stroke-width="2.6" />
    </button>
  </nav>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-m);
  padding: var(--space-s) var(--space-l) calc(var(--space-s) + env(safe-area-inset-bottom));
}

.bar__group {
  display: flex;
  align-items: center;
  padding: 5px;
  border-radius: var(--radius-capsule);
}

.bar__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 54px;
  border-radius: var(--radius-capsule);
  color: var(--label-secondary);
  transition: background var(--duration-control) var(--ease-control), color var(--duration-control) var(--ease-control);
}

.bar__item--selected {
  color: var(--label);
}

.bar__bubble {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-capsule);
  color: var(--label);
  cursor: grab;
  touch-action: none;
  user-select: none;
  transition: transform 0.35s cubic-bezier(0.3, 1.4, 0.5, 1);
}

.bar__bubble--dragging {
  cursor: grabbing;
  transition: none;
  z-index: 3;
  box-shadow: var(--shadow-glass), inset 0 1px 0 var(--glass-highlight);
}

.bar__create {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-capsule);
  color: #fff;
  transition: transform var(--duration-control) var(--ease-control);
}

.bar__create:active {
  transform: scale(0.95);
}
</style>
