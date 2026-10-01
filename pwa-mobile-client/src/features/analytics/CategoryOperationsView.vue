<script setup lang="ts">
import { t } from '@/core/i18n'
import { computed, ref } from 'vue'
import EmptyState from '@/design/EmptyState.vue'
import LoadMoreSentinel from '@/design/LoadMoreSentinel.vue'
import SheetView from '@/design/SheetView.vue'
import { useIncrementalGroups } from '@/design/incrementalList'
import OperationRow from '@/features/operations/OperationRow.vue'
import OperationDetailSheet from '@/features/operations/OperationDetailSheet.vue'
import { AnalyticsPeriod, operationsWording, periodInSentence, shareTitle, uncategorizedName } from '@/core/model/analytics'
import { formatBalance, type CurrencyCode } from '@/core/model/money'
import { ledgerStore as store } from '@/core/store/ledgerStore'

const props = defineProps<{ categoryId: string; period: AnalyticsPeriod; currency: CurrencyCode }>()
const emit = defineEmits<{ close: [] }>()

const selectedID = ref<string | null>(null)

const spending = computed(() =>
  store.expenseReport(props.period, props.currency).categories.find((item) => item.id === props.categoryId) ?? null
)

const allDays = computed(() => store.expenseDays(props.categoryId, props.period, props.currency))
const { visible: days, hasMore, showMore } = useIncrementalGroups(allDays, {
  resetOn: () => [props.categoryId, props.period.id, props.currency]
})
</script>

<template>
  <SheetView
    :open="true"
    :title="spending?.name ?? uncategorizedName"
    :cancel-title="t('common.back')"
    @close="emit('close')"
  >
    <EmptyState
      v-if="!spending"
      :title="t('an.noExpenses')"
      symbol="tray"
      :description="t('an.noCategoryExpenses', { period: periodInSentence(period.title) })"
    />

    <div v-else class="category">
      <div class="category__header">
        <p class="category__total numeric">{{ formatBalance(spending.total.amount, spending.total.currency) }}</p>
        <p class="text-subheadline secondary">
          {{ t('an.shareOfExpenses', { operations: operationsWording(spending.operationCount), share: shareTitle(spending.share) }) }}
        </p>
      </div>

      <section v-for="day in days" :key="day.id" class="category__section">
        <h3 class="category__day text-subheadline">{{ day.title }}</h3>

        <div class="category__card">
          <button
            v-for="row in day.rows"
            :key="row.id"
            type="button"
            class="category__row"
            @click="selectedID = row.id"
          >
            <OperationRow :model="row" />
          </button>
        </div>
      </section>

      <LoadMoreSentinel v-if="hasMore" @visible="showMore" />
    </div>

    <OperationDetailSheet v-if="selectedID" :operation-id="selectedID" @close="selectedID = null" />
  </SheetView>
</template>

<style scoped>
.category {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
  padding: var(--space-l) var(--space-l) var(--space-xl);
}

.category__header {
  text-align: center;
}

.category__header p {
  margin: 0 0 var(--space-xs);
}

.category__total {
  font-size: 34px;
  font-weight: 700;
}

.category__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.category__day {
  margin: 0;
  padding: 0 var(--space-xs);
  font-weight: 600;
}

.category__card {
  background: var(--field-background);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.category__row {
  display: block;
  width: 100%;
  text-align: left;
}

.category__row + .category__row {
  box-shadow: inset 0 1px 0 var(--separator);
}
</style>
