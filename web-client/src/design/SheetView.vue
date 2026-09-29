<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    detent?: 'large' | 'medium'
    cancelTitle?: string
  }>(),
  { detent: 'large', cancelTitle: 'Отмена' }
)

const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDivElement | null>(null)
const content = ref<HTMLDivElement | null>(null)
const bottom = ref<HTMLDivElement | null>(null)
const bottomHeight = ref(0)
let bottomObserver: ResizeObserver | null = null

const visible = ref(false)
const isClosing = ref(false)

const dragOffset = ref(0)
const isDragging = ref(false)
const isSettling = ref(false)
const isDragDismissing = ref(false)

const startY = ref(0)
const startOffset = ref(0)
const startTime = ref(0)
const panelHeight = ref(0)
const pointerID = ref<number | null>(null)

const dismissDistance = computed(() => Math.min(140, panelHeight.value * 0.25))
const dismissVelocity = 0.6

const panelStyle = computed(() =>
  dragOffset.value > 0 ? { transform: `translateY(${dragOffset.value}px)` } : undefined
)

const scrimStyle = computed(() => {
  if (dragOffset.value <= 0 || panelHeight.value <= 0) return undefined
  const progress = Math.min(1, dragOffset.value / panelHeight.value)
  return { opacity: String(1 - progress * 0.7) }
})

function close(): void {
  if (isClosing.value) return
  isClosing.value = true
  visible.value = false
}

function onAfterLeave(): void {
  dragOffset.value = 0
  isSettling.value = false
  isDragDismissing.value = false
  isClosing.value = false
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && visible.value) close()
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"]'))
}

function canDragFrom(target: EventTarget | null): boolean {
  if (isInteractive(target)) return false
  if (!(target instanceof Node)) return true
  const scroller = content.value
  if (scroller && scroller.contains(target)) return scroller.scrollTop <= 0
  return true
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (isClosing.value || !canDragFrom(event.target)) return

  pointerID.value = event.pointerId
  startY.value = event.clientY
  startOffset.value = dragOffset.value
  startTime.value = event.timeStamp
  panelHeight.value = dialog.value?.offsetHeight ?? 0
  isSettling.value = false
}

function onPointerMove(event: PointerEvent): void {
  if (pointerID.value !== event.pointerId) return

  const next = Math.max(0, startOffset.value + event.clientY - startY.value)

  if (!isDragging.value) {
    if (next < 6) return
    isDragging.value = true
    dialog.value?.setPointerCapture(event.pointerId)
  }

  dragOffset.value = next
}

function onPointerUp(event: PointerEvent): void {
  if (pointerID.value !== event.pointerId) return

  const dragged = isDragging.value
  const distance = dragOffset.value
  const elapsed = Math.max(1, event.timeStamp - startTime.value)
  const velocity = distance / elapsed

  pointerID.value = null
  isDragging.value = false
  dialog.value?.releasePointerCapture?.(event.pointerId)

  if (!dragged) return

  if (distance > dismissDistance.value || velocity > dismissVelocity) {
    dismissByDrag()
    return
  }

  settleBack()
}

function settleBack(): void {
  if (dragOffset.value === 0) return
  isSettling.value = true
  requestAnimationFrame(() => {
    dragOffset.value = 0
  })
}

function dismissByDrag(): void {
  isClosing.value = true
  isDragDismissing.value = true
  isSettling.value = true
  const height = panelHeight.value || dialog.value?.offsetHeight || 0
  requestAnimationFrame(() => {
    dragOffset.value = height
  })
}

function onTransitionEnd(event: TransitionEvent): void {
  if (event.target !== dialog.value || event.propertyName !== 'transform') return
  isSettling.value = false
  if (isDragDismissing.value) visible.value = false
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (!isClosing.value) visible.value = true
      return
    }
    if (visible.value) close()
  }
)

watch(visible, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : ''
  if (isOpen) requestAnimationFrame(() => dialog.value?.focus())
})

watch(bottom, (element) => {
  bottomObserver?.disconnect()
  bottomObserver = null
  if (!element) {
    bottomHeight.value = 0
    return
  }
  bottomObserver = new ResizeObserver(() => (bottomHeight.value = element.offsetHeight))
  bottomObserver.observe(element)
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (props.open) requestAnimationFrame(() => (visible.value = true))
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  bottomObserver?.disconnect()
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet" @after-leave="onAfterLeave">
      <div v-if="visible" class="sheet" role="presentation">
        <div class="sheet__scrim" :style="scrimStyle" @click="close" />

        <div
          ref="dialog"
          class="sheet__panel"
          :class="[
            `sheet__panel--${detent}`,
            { 'sheet__panel--dragging': isDragging, 'sheet__panel--settling': isSettling }
          ]"
          :style="panelStyle"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @transitionend="onTransitionEnd"
        >
          <div class="sheet__grabber" />

          <header class="sheet__bar">
            <button
              type="button"
              class="sheet__cancel liquid-glass"
              :aria-label="cancelTitle"
              @click="close"
            >
              <AppIcon name="chevron.left" :size="24" :stroke-width="2.4" />
            </button>
            <h2 class="sheet__title text-headline">{{ title }}</h2>
            <div class="sheet__action">
              <slot name="action" />
            </div>
          </header>

          <div ref="content" class="sheet__content" :style="{ paddingBottom: `${bottomHeight}px` }">
            <slot />
          </div>

          <div v-if="$slots.bottom" ref="bottom" class="sheet__bottom">
            <slot name="bottom" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet__scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
}

.sheet__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(640px, 100%);
  background: var(--screen-background);
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: var(--shadow-card);
  overflow: hidden;
  touch-action: pan-y;
}

.sheet__panel--dragging {
  transition: none;
}

.sheet__panel--settling {
  transition: transform var(--duration-content) var(--ease-content);
}

.sheet__panel--large {
  height: calc(100dvh - env(safe-area-inset-top) - 12px);
}

.sheet__panel--medium {
  max-height: calc(100dvh - env(safe-area-inset-top) - 12px);
  height: min(560px, calc(100dvh - 60px));
}

.sheet__grabber {
  width: 36px;
  height: 5px;
  margin: 6px auto 0;
  border-radius: 3px;
  background: var(--label-tertiary);
}

.sheet__bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-s) var(--space-l);
}

.sheet__cancel {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-capsule);
  color: var(--label);
}

.sheet__title {
  margin: 0;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sheet__action {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: var(--space-s);
  color: var(--accent);
}

.sheet__content {
  flex: 1 1 auto;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.sheet__bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: var(--space-m) var(--space-m) calc(var(--space-s) + env(safe-area-inset-bottom));
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--duration-control) var(--ease-control);
}

.sheet-enter-active .sheet__panel,
.sheet-leave-active .sheet__panel {
  transition: transform var(--duration-content) var(--ease-content);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .sheet__panel,
.sheet-leave-to .sheet__panel {
  transform: translateY(100%);
}
</style>
