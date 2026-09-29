<script setup lang="ts">
import AppIcon from '@/design/AppIcon.vue'
import { operators, operatorSpokenName, separatorSymbol, type AmountKey, type AmountOperator } from '@/core/model/amountExpression'

const emit = defineEmits<{ key: [AmountKey] }>()

const [plus, minus, times, dividedBy] = operators

const rows: AmountKey[][] = [
  [{ kind: 'digit', digit: 7 }, { kind: 'digit', digit: 8 }, { kind: 'digit', digit: 9 }, { kind: 'action', action: dividedBy }],
  [{ kind: 'digit', digit: 4 }, { kind: 'digit', digit: 5 }, { kind: 'digit', digit: 6 }, { kind: 'action', action: times }],
  [{ kind: 'digit', digit: 1 }, { kind: 'digit', digit: 2 }, { kind: 'digit', digit: 3 }, { kind: 'action', action: minus }],
  [{ kind: 'digit', digit: 0 }, { kind: 'separator' }, { kind: 'delete' }, { kind: 'action', action: plus }]
]

function label(key: AmountKey): string {
  switch (key.kind) {
    case 'digit':
      return String(key.digit)
    case 'separator':
      return separatorSymbol
    case 'action':
      return key.action
    case 'delete':
      return ''
  }
}

function accessibilityLabel(key: AmountKey): string {
  switch (key.kind) {
    case 'digit':
      return String(key.digit)
    case 'separator':
      return 'запятая'
    case 'delete':
      return 'стереть'
    case 'action':
      return operatorSpokenName(key.action as AmountOperator)
  }
}

function keyID(key: AmountKey): string {
  return key.kind === 'digit' ? `digit-${key.digit}` : key.kind === 'action' ? `action-${key.action}` : key.kind
}
</script>

<template>
  <div class="keypad" role="group" aria-label="Клавиатура суммы">
    <div v-for="(row, index) in rows" :key="index" class="keypad__row">
      <button
        v-for="key in row"
        :key="keyID(key)"
        type="button"
        class="keypad__key"
        :class="{ 'keypad__key--action': key.kind === 'action' }"
        :aria-label="accessibilityLabel(key)"
        @click="emit('key', key)"
      >
        <AppIcon v-if="key.kind === 'delete'" name="delete.backward" :size="20" />
        <span v-else>{{ label(key) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.keypad {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.keypad__row {
  display: flex;
  gap: var(--space-s);
}

.keypad__key {
  flex: 1 1 0;
  height: 50px;
  border-radius: var(--radius-field);
  background: var(--fill-tertiary);
  font-size: 24px;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--duration-control) var(--ease-control);
}

.keypad__key:active {
  transform: scale(0.96);
}

.keypad__key--action {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}
</style>
