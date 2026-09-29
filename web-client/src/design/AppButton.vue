<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'prominent' | 'glass' | 'plain'
    tone?: 'accent' | 'danger'
    disabled?: boolean
    type?: 'button' | 'submit'
    fullWidth?: boolean
  }>(),
  { variant: 'prominent', tone: 'accent', disabled: false, type: 'button', fullWidth: false }
)
</script>

<template>
  <button
    :type="type"
    class="button"
    :class="[
      `button--${variant}`,
      `button--${tone}`,
      {
        'button--full': fullWidth,
        'liquid-glass': variant !== 'plain'
      }
    ]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-s);
  min-height: 50px;
  padding: 0 var(--space-xl);
  border-radius: var(--radius-capsule);
  font-size: 17px;
  font-weight: 600;
  transition: opacity var(--duration-control) var(--ease-control),
    transform var(--duration-control) var(--ease-control);
}

.button--full {
  width: 100%;
}

.button:active:not(:disabled) {
  transform: scale(0.98);
}

.button:disabled {
  opacity: 0.45;
  cursor: default;
}

.button--prominent.button--accent {
  background: var(--accent-glass);
  border-color: var(--glass-highlight);
  color: #fff;
}

.button--prominent.button--danger {
  background: var(--danger-glass);
  border-color: var(--glass-highlight);
  color: #fff;
}

.button--glass {
  color: var(--label);
}

.button--glass.button--danger {
  background: var(--danger-glass);
  border-color: var(--glass-highlight);
  color: #fff;
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .button--prominent.button--accent {
    background: var(--accent);
  }

  .button--prominent.button--danger {
    background: var(--danger);
  }
}

.button--plain {
  min-height: 0;
  padding: 0;
  border-radius: 0;
  font-weight: 400;
}

.button--plain:active:not(:disabled) {
  transform: none;
  opacity: 0.4;
}

.button--plain.button--accent {
  color: var(--accent);
}

.button--plain.button--danger {
  color: var(--danger);
}
</style>
