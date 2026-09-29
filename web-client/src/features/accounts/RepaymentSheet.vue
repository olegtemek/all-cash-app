<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '@/design/AppButton.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import InlineMessage from '@/design/InlineMessage.vue'
import SheetView from '@/design/SheetView.vue'
import { decimalFromText } from '@/core/model/amountInput'
import { fromDateInputValue, toDateInputValue } from '@/core/model/dates'
import { currencySymbol, formatBalance } from '@/core/model/money'
import { DebtRules, repaymentErrorText, type RepaymentError } from '@/core/model/rules'
import { ledgerStore as store } from '@/core/store/ledgerStore'
import { debtDirectionTitle, type DebtSummary } from '@/core/store/models'

const props = defineProps<{ debt: DebtSummary }>()
const emit = defineEmits<{ close: [] }>()

const accounts = computed(() => store.selectableAccounts(props.debt.outstanding.currency))

const amountText = ref(String(props.debt.outstanding.amount))
const selectedAccountID = ref<string | null>(
  accounts.value.find((account) => account.name === props.debt.accountName)?.id ?? accounts.value[0]?.id ?? null
)
const date = ref(new Date().toISOString())
const error = ref<RepaymentError | null>(null)

const selectedAccount = computed(() => accounts.value.find((account) => account.id === selectedAccountID.value) ?? null)
const amount = computed(() => decimalFromText(amountText.value))

const dateValue = computed({
  get: () => toDateInputValue(date.value),
  set: (raw: string) => {
    date.value = fromDateInputValue(raw, date.value)
  }
})

async function submit(): Promise<void> {
  const failure = DebtRules.validateRepayment(amount.value, props.debt.outstanding, selectedAccount.value)
  if (failure) {
    error.value = failure
    return
  }

  const value = amount.value
  const account = selectedAccount.value
  if (value === null || !account) return

  await store.repay(props.debt, value, account, date.value)
  emit('close')
}
</script>

<template>
  <SheetView :open="true" title="Погашение" detent="medium" @close="emit('close')">
    <div class="form">
      <FormCard title="Долг">
        <FieldRow
          :symbol="debt.direction === 'given' ? 'person.crop.circle.badge.minus' : 'person.crop.circle.badge.plus'"
        >
          <span class="form__debt">
            <span>{{ debt.counterparty }}</span>
            <span class="text-footnote secondary">{{ debtDirectionTitle(debt.direction) }}</span>
          </span>
          <span class="form__value secondary numeric">
            {{ formatBalance(debt.outstanding.amount, debt.outstanding.currency) }}
          </span>
        </FieldRow>
      </FormCard>

      <FormCard title="Погашение">
        <FieldRow symbol="banknote">
          <input
            v-model="amountText"
            class="form__input numeric"
            type="text"
            inputmode="decimal"
            placeholder="0"
            aria-label="Сумма погашения"
            @input="error = null"
          />
          <span class="secondary">{{ currencySymbol(debt.outstanding.currency) }}</span>
        </FieldRow>

        <FormDivider />

        <FieldRow symbol="creditcard">
          <span>Счёт</span>
          <span v-if="accounts.length === 0" class="form__value secondary">Нет подходящих</span>
          <select v-else v-model="selectedAccountID" class="form__select" aria-label="Счёт">
            <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
          </select>
        </FieldRow>

        <FormDivider />

        <FieldRow symbol="calendar">
          <span>Дата</span>
          <input v-model="dateValue" class="form__date" type="date" aria-label="Дата" />
        </FieldRow>
      </FormCard>

      <div class="form__notes">
        <InlineMessage v-if="error" kind="error" :text="repaymentErrorText(error)" />

        <InlineMessage
          v-if="accounts.length === 0"
          kind="info"
          :text="`Погашать долг можно только счётом в его валюте — ${debt.outstanding.currency}. Создайте такой счёт или верните его из архива.`"
        />
        <InlineMessage
          v-else
          kind="info"
          text="Сумма подставлена по остатку. Её можно уменьшить — тогда погашение будет частичным."
        />
      </div>
    </div>

    <template #bottom>
      <AppButton full-width :disabled="accounts.length === 0" @click="submit">Погасить</AppButton>
    </template>
  </SheetView>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-l);
}

.form__debt {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.form__value {
  margin-left: auto;
}

.form__input {
  width: 100%;
  border: none;
  background: none;
  outline: none;
  font-size: 17px;
}

.form__select {
  margin-left: auto;
  border: none;
  background: none;
  color: var(--accent);
  text-align: right;
  text-align-last: right;
}

.form__date {
  margin-left: auto;
  border: none;
  background: none;
  color: var(--label-secondary);
  font-size: 17px;
}

.form__notes {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
</style>
