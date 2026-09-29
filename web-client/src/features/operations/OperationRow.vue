<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/design/AppIcon.vue'
import { isFailed, syncSymbol } from '@/core/model/ledger'
import { paletteVar } from '@/core/model/palette'
import { isTransferRow, rowAccessibilityLabel, type OperationRowModel, type RowAmount } from '@/core/store/models'

const props = defineProps<{ model: OperationRowModel }>()

const marker = computed(() => syncSymbol(props.model.syncState))
const markerIsFailed = computed(() => isFailed(props.model.syncState))

function amountClass(amount: RowAmount, index: number): string {
  if (index > 0) return 'row__amount--secondary'
  if (isTransferRow(props.model)) return ''
  return amount.direction === 'incoming' ? 'row__amount--incoming' : ''
}
</script>

<template>
  <div class="row" :aria-label="rowAccessibilityLabel(model)">
    <span class="row__icon" :style="{ background: paletteVar(model.tint) }">
      <AppIcon :name="model.symbolName" :size="16" />
    </span>

    <span class="row__text">
      <span class="row__title">{{ model.title }}</span>
      <span v-if="model.subtitle" class="row__subtitle text-footnote secondary">{{ model.subtitle }}</span>
    </span>

    <span class="row__trailing">
      <AppIcon
        v-if="marker"
        :name="marker"
        :size="14"
        class="row__marker"
        :class="{ 'row__marker--failed': markerIsFailed }"
      />

      <span class="row__amounts">
        <span
          v-for="(amount, index) in model.amounts"
          :key="index"
          class="row__amount numeric"
          :class="amountClass(amount, index)"
        >
          {{ amount.text }}
        </span>
      </span>
    </span>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  width: 100%;
  padding: var(--space-m) var(--space-l);
  text-align: left;
}

.row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-icon);
  color: #fff;
}

.row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.row__title {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.row__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__trailing {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  flex: 0 0 auto;
}

.row__marker {
  color: var(--label-secondary);
}

.row__marker--failed {
  color: var(--warning);
}

.row__amounts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.row__amount {
  font-weight: 500;
  white-space: nowrap;
}

.row__amount--secondary {
  font-size: 13px;
  font-weight: 400;
  color: var(--label-secondary);
}

.row__amount--incoming {
  color: var(--success);
}
</style>
