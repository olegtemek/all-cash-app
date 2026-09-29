<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/design/AppIcon.vue'
import type { AmountExpression } from '@/core/model/amountExpression'
import { currencySymbol, directionSign, formatBalance, type CurrencyCode, type Direction } from '@/core/model/money'

const props = defineProps<{
  caption: string
  expression: AmountExpression
  currency: CurrencyCode
  direction: Direction
}>()

const result = computed(() => props.expression.value)

const resultText = computed(() => {
  if (!props.expression.hasOperator) return null
  const value = result.value
  return value.ok ? formatBalance(value.value, props.currency) : null
})

const failureText = computed(() => {
  const value = result.value
  return !value.ok && value.failure === 'divisionByZero' ? 'Деление на ноль' : null
})
</script>

<template>
  <div class="amount">
    <p class="amount__caption text-footnote secondary">{{ caption }}</p>

    <p class="amount__value">
      <span>{{ directionSign(direction) }}</span>
      <span class="amount__number">{{ expression.display }}</span>
      <span class="secondary">{{ currencySymbol(currency) }}</span>
    </p>

    <p class="amount__note text-subheadline">
      <template v-if="failureText">
        <span class="amount__error">
          <AppIcon name="exclamationmark.triangle.fill" :size="14" />
          {{ failureText }}
        </span>
      </template>
      <template v-else-if="resultText">
        <span class="secondary">= {{ resultText }}</span>
      </template>
    </p>
  </div>
</template>

<style scoped>
.amount {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  text-align: center;
}

.amount__caption {
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amount__value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: var(--space-xs);
  margin: 0;
  font-size: clamp(28px, 9vw, 40px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  max-width: 100%;
}

.amount__number {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amount__note {
  margin: 0;
  min-height: 20px;
}

.amount__error {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--danger);
}
</style>
