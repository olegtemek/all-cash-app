<script setup lang="ts">
import { t } from '@/core/i18n'
import { computed, onMounted, ref } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import EmptyState from '@/design/EmptyState.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import LoadMoreSentinel from '@/design/LoadMoreSentinel.vue'
import LoadingView from '@/design/LoadingView.vue'
import ScreenHeader from '@/design/ScreenHeader.vue'
import SegmentedControl from '@/design/SegmentedControl.vue'
import CategoryOperationsView from './CategoryOperationsView.vue'
import SpendingDonut from './SpendingDonut.vue'
import { useIncrementalList } from '@/design/incrementalList'
import { AnalyticsPeriod, operationsWording, periodInSentence, shareTitle } from '@/core/model/analytics'
import { formatBalance, preferredCurrency, type CurrencyCode } from '@/core/model/money'
import { paletteVar } from '@/core/model/palette'
import { ledgerStore as store } from '@/core/store/ledgerStore'

const period = ref(AnalyticsPeriod.current())
const chosenCurrency = ref<CurrencyCode | null>(null)
const openCategoryID = ref<string | null>(null)

const phase = store.phase

const currencies = computed(() => store.analyticsCurrencies.value)

const currency = computed<CurrencyCode>(() => {
  const chosen = chosenCurrency.value
  if (chosen && currencies.value.includes(chosen)) return chosen

  const suggested = store.account(store.suggestedAccountID.value)?.currency
  return suggested ?? currencies.value[0] ?? preferredCurrency()
})

const report = computed(() => store.expenseReport(period.value, currency.value))
const reportCategories = computed(() => report.value.categories)
const {
  visible: visibleCategories,
  hasMore: hasMoreCategories,
  showMore: showMoreCategories
} = useIncrementalList(reportCategories, { resetOn: () => [period.value.id, currency.value] })

const earliestPeriod = computed(() => {
  const range = store.operationDateRange.value
  const from = range ? new Date(Math.min(range.from.getTime(), Date.now())) : new Date()
  return AnalyticsPeriod.containing(from)
})

const latestPeriod = computed(() => {
  const range = store.operationDateRange.value
  const to = range ? new Date(Math.max(range.to.getTime(), Date.now())) : new Date()
  return AnalyticsPeriod.containing(to)
})

const availablePeriods = computed(() => {
  const periods: AnalyticsPeriod[] = []
  let cursor = latestPeriod.value

  while (cursor.start >= earliestPeriod.value.start && periods.length < 60) {
    periods.push(cursor)
    cursor = cursor.shifted(-1)
  }
  return periods
})

const canGoBack = computed(() => period.value.start > earliestPeriod.value.start)
const canGoForward = computed(() => period.value.start < latestPeriod.value.start)

function shift(months: number): void {
  period.value = period.value.shifted(months)
}

function selectPeriod(id: string): void {
  const found = availablePeriods.value.find((item) => String(item.id) === id)
  if (found) period.value = found
}

onMounted(() => {
  void store.loadIfNeeded()
})
</script>

<template>
  <div class="screen">
    <ScreenHeader :title="t('tabs.analytics')" />

    <LoadingView v-if="phase.kind === 'loading'" />

    <EmptyState
      v-else-if="phase.kind === 'failed'"
      :title="t('an.failed')"
      symbol="exclamationmark.triangle"
      :description="phase.message"
    >
      <template #actions>
        <AppButton @click="store.load()">{{ t('common.retry') }}</AppButton>
      </template>
    </EmptyState>

    <template v-else>
      <div class="controls">
        <div class="period">
          <button
            type="button"
            class="period__step"
            :disabled="!canGoBack"
            :aria-label="t('an.prevMonth')"
            @click="shift(-1)"
          >
            <AppIcon name="chevron.left" :size="18" />
          </button>

          <select
            class="period__select text-headline"
            :value="String(period.id)"
            :aria-label="t('an.month')"
            @change="selectPeriod(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="item in availablePeriods" :key="item.id" :value="String(item.id)">
              {{ item.title }}
            </option>
          </select>

          <button
            type="button"
            class="period__step"
            :disabled="!canGoForward"
            :aria-label="t('an.nextMonth')"
            @click="shift(1)"
          >
            <AppIcon name="chevron.right" :size="18" />
          </button>
        </div>

        <SegmentedControl
          v-if="currencies.length > 1"
          :model-value="currency"
          :label="t('common.currency')"
          :options="currencies.map((code) => ({ value: code, title: code }))"
          @update:model-value="chosenCurrency = $event"
        />
      </div>

      <EmptyState
        v-if="report.categories.length === 0"
        :title="t('an.noExpenses')"
        symbol="chart.pie"
        :description="
          currencies.length > 1
            ? t('an.noExpensesCurrency', { period: periodInSentence(period.title), currency })
            : t('an.noExpensesPeriod', { period: periodInSentence(period.title) })
        "
      />

      <div v-else class="body">
        <div class="total">
          <p class="total__value numeric">{{ formatBalance(report.total.amount, report.total.currency) }}</p>
          <p class="text-subheadline secondary">{{ t('an.monthExpenses') }}</p>
        </div>

        <SpendingDonut :categories="report.categories" />

        <FormCard :title="t('common.categories')">
          <template v-for="(spending, index) in visibleCategories" :key="spending.id">
            <FormDivider v-if="index > 0" />

            <button type="button" class="spending" @click="openCategoryID = spending.id">
              <span class="spending__icon" :style="{ background: paletteVar(spending.color) }">
                <AppIcon :name="spending.symbolName" :size="16" />
              </span>

              <span class="spending__text">
                <span>{{ spending.name }}</span>
                <span class="text-footnote secondary">
                  {{ shareTitle(spending.share) }} · {{ operationsWording(spending.operationCount) }}
                </span>
              </span>

              <span class="spending__amount numeric">
                {{ formatBalance(spending.total.amount, spending.total.currency) }}
              </span>

              <AppIcon name="chevron.right" :size="14" class="tertiary" />
            </button>
          </template>

          <LoadMoreSentinel v-if="hasMoreCategories" @visible="showMoreCategories" />
        </FormCard>
      </div>
    </template>

    <CategoryOperationsView
      v-if="openCategoryID"
      :category-id="openCategoryID"
      :period="period"
      :currency="currency"
      @close="openCategoryID = null"
    />
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  padding: 0 var(--space-l) var(--space-m);
}

.period {
  display: flex;
  align-items: center;
  border-radius: var(--radius-field);
  background: var(--field-background);
}

.period__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  color: var(--accent);
}

.period__step:disabled {
  color: var(--label-tertiary);
}

.period__select {
  flex: 1 1 auto;
  height: 44px;
  border: none;
  background: none;
  text-align: center;
  text-align-last: center;
}

.body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: 0 var(--space-l) var(--space-xl);
}

.total {
  text-align: center;
  padding-top: var(--space-s);
}

.total p {
  margin: 0 0 var(--space-xs);
}

.total__value {
  font-size: 34px;
  font-weight: 700;
}

.spending {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  width: 100%;
  min-height: 56px;
  padding: var(--space-m) var(--space-l);
  background: var(--field-background);
  text-align: left;
}

.spending__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-icon);
  color: #fff;
}

.spending__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.spending__text > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spending__amount {
  flex: 0 0 auto;
  font-weight: 500;
}
</style>
