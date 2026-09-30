<script setup lang="ts">
import { t } from '@/core/i18n'
import { computed, ref } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import ConfirmDialog from '@/design/ConfirmDialog.vue'
import EmptyState from '@/design/EmptyState.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import SheetView from '@/design/SheetView.vue'
import { deletionWarning } from './deletionWarning'
import { isFailed, syncSymbol } from '@/core/model/ledger'
import { paletteVar } from '@/core/model/palette'
import { ledgerStore as store } from '@/core/store/ledgerStore'
import { detailAccessibilityLabel, detailSyncTitle, type DetailAmount } from '@/core/store/models'

const props = defineProps<{ operationId: string }>()
const emit = defineEmits<{ close: []; edit: [string]; openDebt: [string] }>()

const isConfirmingDeletion = ref(false)

const detail = computed(() => store.operationDetail(props.operationId))
const hasDebt = computed(() => {
  const id = detail.value?.debtID
  return id ? store.debt(id) !== null : false
})

function amountClass(amount: DetailAmount, index: number): string {
  const current = detail.value
  if (!current) return ''
  if (current.amounts.length > 1) return index > 0 ? 'detail__amount--secondary' : ''
  return amount.direction === 'incoming' ? 'detail__amount--incoming' : ''
}

async function confirmDeletion(): Promise<void> {
  isConfirmingDeletion.value = false
  emit('close')
  await store.deleteOperation(props.operationId)
}
</script>

<template>
  <SheetView
    :open="true"
    :title="detail?.typeLabel ?? t('common.operation')"
    detent="medium"
    :cancel-title="t('common.close')"
    @close="emit('close')"
  >
    <EmptyState
      v-if="!detail"
      :title="t('common.operationNotFound')"
      symbol="questionmark.circle"
    />

    <div v-else class="detail">
      <div class="detail__header">
        <span class="detail__mark" :style="{ background: paletteVar(detail.tint) }">
          <AppIcon :name="detail.symbolName" :size="24" />
        </span>

        <div class="detail__amounts" :aria-label="detailAccessibilityLabel(detail)">
          <div v-for="(amount, index) in detail.amounts" :key="index" class="detail__amount-block">
            <p class="detail__amount numeric" :class="amountClass(amount, index)">{{ amount.text }}</p>
            <p class="detail__amount-label text-subheadline secondary">
              {{ amount.label ?? (detail.title === detail.typeLabel ? detail.typeLabel : `${detail.typeLabel} · ${detail.title}`) }}
            </p>
          </div>
        </div>
      </div>

      <FormCard :title="t('common.operation')">
        <template v-for="(field, index) in detail.fields" :key="field.title">
          <FormDivider v-if="index > 0" />
          <FieldRow :symbol="field.symbolName">
            <span>{{ field.title }}</span>
            <span class="detail__value secondary">{{ field.value }}</span>
          </FieldRow>
        </template>

        <FormDivider />
        <FieldRow :symbol="syncSymbol(detail.syncState) ?? 'checkmark.icloud'">
          <span>{{ t('ops.syncStatus') }}</span>
          <span class="detail__value" :class="{ 'detail__value--failed': isFailed(detail.syncState) }">
            {{ detailSyncTitle(detail.syncState) }}
          </span>
        </FieldRow>

        <template v-if="detail.debtID && hasDebt">
          <FormDivider />
          <FieldRow symbol="person.text.rectangle" as="button" @click="emit('openDebt', detail.debtID!)">
            <span>{{ t('common.debt') }}</span>
            <span class="detail__value secondary">{{ t('common.open') }}</span>
            <template #accessory>
              <AppIcon name="chevron.right" :size="14" />
            </template>
          </FieldRow>
        </template>
      </FormCard>

      <FormCard v-if="detail.note" :title="t('common.description')">
        <FieldRow symbol="text.alignleft">
          <span>{{ detail.note }}</span>
        </FieldRow>
      </FormCard>
    </div>

    <template v-if="detail" #bottom>
      <div class="detail__actions">
        <AppButton v-if="detail.isEditable" full-width @click="emit('edit', operationId)">
          <AppIcon name="pencil" :size="18" />
          {{ t('common.edit') }}
        </AppButton>

        <AppButton variant="glass" tone="danger" full-width @click="isConfirmingDeletion = true">
          <AppIcon name="trash" :size="18" />
          {{ t('common.delete') }}
        </AppButton>
      </div>
    </template>
  </SheetView>

  <ConfirmDialog
    :open="isConfirmingDeletion"
    :title="t('ops.deleteTitle')"
    :message="deletionWarning(operationId, store)"
    @confirm="confirmDeletion"
    @cancel="isConfirmingDeletion = false"
  />
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-l) var(--space-l) var(--space-xl);
}

.detail__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-m);
  padding-top: var(--space-s);
}

.detail__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-mark);
  color: #fff;
}

.detail__amounts {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  text-align: center;
}

.detail__amount {
  margin: 0;
  font-size: 34px;
  font-weight: 700;
}

.detail__amount--secondary {
  font-size: 20px;
  font-weight: 600;
}

.detail__amount--incoming {
  color: var(--success);
}

.detail__amount-label {
  margin: 2px 0 0;
}

.detail__value {
  margin-left: auto;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail__value--failed {
  color: var(--warning);
}

.detail__actions {
  display: flex;
  gap: var(--space-m);
}
</style>
