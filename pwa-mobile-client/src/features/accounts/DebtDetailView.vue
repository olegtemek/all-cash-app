<script setup lang="ts">
import { t } from '@/core/i18n'
import { computed } from 'vue'
import AppIcon from '@/design/AppIcon.vue'
import EmptyState from '@/design/EmptyState.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import SheetView from '@/design/SheetView.vue'
import { dayMonth, fullDate } from '@/core/model/dates'
import { isFailed, syncSymbol, type DebtDirection } from '@/core/model/ledger'
import { formatBalance, formatMoney } from '@/core/model/money'
import { ledgerStore as store } from '@/core/store/ledgerStore'
import {
  debtDirectionTitle,
  debtStateTitle,
  isDebtAggregated,
  isDebtClosed,
  type DebtRepayment,
  type DebtTranche
} from '@/core/store/models'

const props = defineProps<{ debtId: string }>()
const emit = defineEmits<{ close: [] }>()

const debt = computed(() => store.debt(props.debtId))

function trancheAmount(tranche: DebtTranche, direction: DebtDirection): string {
  return formatMoney(tranche.amount, direction === 'given' ? 'outgoing' : 'incoming')
}

function repaymentAmount(repayment: DebtRepayment, direction: DebtDirection): string {
  return formatMoney(repayment.amount, direction === 'given' ? 'incoming' : 'outgoing')
}
</script>

<template>
  <SheetView
    :open="true"
    :title="debt?.counterparty ?? t('common.debt')"
    :cancel-title="t('common.back')"
    @close="emit('close')"
  >
    <EmptyState
      v-if="!debt"
      :title="t('debt.notFound')"
      symbol="questionmark.circle"
    />

    <div v-else class="debt">
      <div class="debt__header">
        <p class="debt__total numeric">{{ formatBalance(debt.outstanding.amount, debt.outstanding.currency) }}</p>
        <p class="text-subheadline secondary">{{ isDebtClosed(debt) ? t('debt.isClosed') : t('debt.remaining') }}</p>
      </div>

      <FormCard :title="t('common.debt')">
        <FieldRow symbol="arrow.left.arrow.right">
          <span>{{ t('common.direction') }}</span>
          <span class="debt__value secondary">{{ debtDirectionTitle(debt.direction) }}</span>
        </FieldRow>

        <FormDivider />

        <FieldRow symbol="banknote">
          <span>{{ isDebtAggregated(debt) ? t('debt.total') : t('debt.amount') }}</span>
          <span class="debt__value secondary numeric">
            {{ formatBalance(debt.principal.amount, debt.principal.currency) }}
          </span>
        </FieldRow>

        <FormDivider />

        <FieldRow symbol="circle.dashed">
          <span>{{ t('debt.state') }}</span>
          <span class="debt__value secondary">{{ debtStateTitle(debt) }}</span>
        </FieldRow>

        <FormDivider />

        <FieldRow symbol="calendar">
          <span>{{ t('debt.open') }}</span>
          <span class="debt__value secondary">{{ fullDate(new Date(debt.openedAt)) }}</span>
        </FieldRow>

        <template v-if="!isDebtAggregated(debt)">
          <FormDivider />
          <FieldRow symbol="creditcard">
            <span>{{ t('common.account') }}</span>
            <span class="debt__value secondary">{{ debt.accountName }}</span>
          </FieldRow>
        </template>
      </FormCard>

      <FormCard v-if="isDebtAggregated(debt)" :title="t('debt.entries')">
        <template v-for="(tranche, index) in debt.tranches" :key="tranche.id">
          <FormDivider v-if="index > 0" />

          <FieldRow
            :symbol="debt.direction === 'given' ? 'person.crop.circle.badge.minus' : 'person.crop.circle.badge.plus'"
          >
            <span class="debt__entry">
              <span>{{ dayMonth(new Date(tranche.date)) }}</span>
              <span class="text-footnote secondary">{{ tranche.accountName }}</span>
            </span>
            <span class="debt__value numeric">{{ trancheAmount(tranche, debt.direction) }}</span>

            <template #accessory>
              <AppIcon
                v-if="syncSymbol(tranche.syncState)"
                :name="syncSymbol(tranche.syncState)!"
                :size="14"
                :class="{ 'debt__marker--failed': isFailed(tranche.syncState) }"
              />
            </template>
          </FieldRow>
        </template>
      </FormCard>

      <p v-if="debt.repayments.length === 0" class="debt__empty text-footnote secondary">{{ t('debt.noRepayments') }}</p>

      <FormCard v-else :title="t('debt.repayments')">
        <template v-for="(repayment, index) in debt.repayments" :key="repayment.id">
          <FormDivider v-if="index > 0" />

          <FieldRow symbol="arrow.uturn.backward">
            <span class="debt__entry">
              <span>{{ dayMonth(new Date(repayment.date)) }}</span>
              <span class="text-footnote secondary">{{ repayment.accountName }}</span>
            </span>
            <span class="debt__value numeric">{{ repaymentAmount(repayment, debt.direction) }}</span>

            <template #accessory>
              <AppIcon
                v-if="syncSymbol(repayment.syncState)"
                :name="syncSymbol(repayment.syncState)!"
                :size="14"
                :class="{ 'debt__marker--failed': isFailed(repayment.syncState) }"
              />
            </template>
          </FieldRow>
        </template>
      </FormCard>
    </div>

  </SheetView>

</template>

<style scoped>
.debt {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-l) var(--space-l) var(--space-xl);
}

.debt__header {
  text-align: center;
  padding-top: var(--space-s);
}

.debt__header p {
  margin: 0 0 var(--space-xs);
}

.debt__total {
  font-size: 34px;
  font-weight: 700;
}

.debt__value {
  margin-left: auto;
  text-align: right;
  font-weight: 500;
}

.debt__entry {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.debt__empty {
  margin: 0;
  padding: 0 var(--space-l);
}

.debt__marker--failed {
  color: var(--warning);
}
</style>
