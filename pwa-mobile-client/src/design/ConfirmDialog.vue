<script setup lang="ts">
import { t } from '@/core/i18n'
withDefaults(
  defineProps<{
    open: boolean
    title: string
    message?: string
    confirmTitle?: string
    cancelTitle?: string
    destructive?: boolean
  }>(),
  { confirmTitle: t('common.delete'), cancelTitle: t('common.cancel'), destructive: true }
)

const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="dialog" role="presentation">
        <div class="dialog__scrim" @click="emit('cancel')" />

        <div class="dialog__panel" role="alertdialog" aria-modal="true" :aria-label="title">
          <div class="dialog__text liquid-glass">
            <p class="dialog__title text-headline">{{ title }}</p>
            <p v-if="message" class="dialog__message text-footnote secondary">{{ message }}</p>
          </div>

          <div class="dialog__actions liquid-glass">
            <button
              type="button"
              class="dialog__button"
              :class="{ 'dialog__button--destructive': destructive }"
              @click="emit('confirm')"
            >
              {{ confirmTitle }}
            </button>

            <button type="button" class="dialog__button dialog__button--cancel" @click="emit('cancel')">
              {{ cancelTitle }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-s);
  padding-bottom: calc(var(--space-s) + env(safe-area-inset-bottom));
}

.dialog__scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
}

.dialog__panel {
  position: relative;
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.dialog__text,
.dialog__actions {
  border-radius: var(--radius-field);
  overflow: hidden;
}

.dialog__text {
  padding: var(--space-l);
  text-align: center;
}

.dialog__title {
  margin: 0;
}

.dialog__message {
  margin: var(--space-xs) 0 0;
}

.dialog__actions {
  display: flex;
  flex-direction: column;
}

.dialog__button {
  padding: 15px var(--space-l);
  font-size: 17px;
  color: var(--accent);
  border-bottom: 1px solid var(--separator);
}

.dialog__button:last-child {
  border-bottom: none;
}

.dialog__button--destructive {
  color: var(--danger);
}

.dialog__button--cancel {
  font-weight: 600;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity var(--duration-control) var(--ease-control);
}

.dialog-enter-active .dialog__panel,
.dialog-leave-active .dialog__panel {
  transition: transform var(--duration-content) var(--ease-content);
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog__panel,
.dialog-leave-to .dialog__panel {
  transform: translateY(calc(100% + var(--space-s)));
}
</style>
