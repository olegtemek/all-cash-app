<script setup lang="ts">
import { t } from '@/core/i18n'
import { computed, ref } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import InlineMessage from '@/design/InlineMessage.vue'
import SheetView from '@/design/SheetView.vue'
import AmountKeypad from '@/features/operations/AmountKeypad.vue'
import TrailingText from '@/design/TrailingText.vue'
import { AmountExpression } from '@/core/model/amountExpression'
import { add, rounded } from '@/core/model/decimal'
import type { Account } from '@/core/model/ledger'
import {
  currencyDisplayName,
  currencySymbol,
  formatBalance,
  formatMoney,
  money,
  preferredCurrency,
  supportedCurrencies,
  type CurrencyCode,
  type Direction
} from '@/core/model/money'
import { AccountRules, accountErrorText, type AccountError } from '@/core/model/rules'
import { hiddenBalanceTitle } from '@/core/store/models'
import { ledgerStore as store } from '@/core/store/ledgerStore'

const props = defineProps<{ editing?: Account | null; balance?: number }>()
const emit = defineEmits<{ close: [] }>()

const edited = computed(() => props.editing ?? null)

const name = ref(edited.value?.name ?? '')
const currency = ref<CurrencyCode>(edited.value?.currency ?? preferredCurrency())
const balance = ref<AmountExpression>(
  edited.value && props.balance ? AmountExpression.fromAmount(props.balance) : AmountExpression.empty()
)
const isHidden = ref(edited.value?.isHidden ?? false)
const error = ref<AccountError | null>(null)
const isSaving = ref(false)
const isTyping = ref(false)

const title = computed(() => (edited.value ? t('acc.title') : t('acc.new')))
const submitTitle = computed(() => (edited.value ? t('common.save') : t('common.create')))

const balanceFieldTitle = computed(() => (edited.value ? t('acc.balanceNow') : t('acc.initial')))

const isEditingBalance = computed(() => !isTyping.value && !isHidden.value)

const enteredBalance = computed(() => {
  const value = balance.value.value
  return value.ok ? rounded(value.value) : 0
})

const hasOperations = computed(() => {
  const account = edited.value
  return account ? store.hasOperationsFor(account.id) : false
})

const isCurrencyLocked = computed(() => hasOperations.value)

const currentBalance = computed(() => {
  const account = edited.value
  if (!account) return null
  return store.accountSummary(account.id)?.balance ?? null
})

const correction = computed(() => {
  const current = currentBalance.value
  return current === null ? 0 : add(enteredBalance.value, -current)
})

const correctionMoney = computed(() => {
  const current = currentBalance.value
  if (correction.value === 0 || current === null) return null
  return money(Math.abs(correction.value), currency.value)
})

const correctionDirection = computed<Direction>(() => (correction.value > 0 ? 'incoming' : 'outgoing'))

const hasChanges = computed(() => {
  const account = edited.value
  if (!account) return true

  return (
    name.value.trim() !== account.name ||
    currency.value !== account.currency ||
    isHidden.value !== account.isHidden ||
    correction.value !== 0
  )
})

async function submit(): Promise<void> {
  isTyping.value = false

  const failure =
    AccountRules.validateName(name.value, store.accountNames(edited.value?.id ?? null)) ??
    AccountRules.validateBalance(balance.value.value)

  if (failure) {
    error.value = failure
    return
  }

  const amount = enteredBalance.value
  const hasCorrection = correction.value !== 0

  isSaving.value = true

  const account = edited.value
  if (account) {
    const updated = await store.updateAccount(
      account.id,
      name.value,
      isCurrencyLocked.value ? account.currency : currency.value,
      account.initialBalance,
      isHidden.value
    )

    if (!updated) {
      isSaving.value = false
      return
    }

    if (hasCorrection && !(await store.correctBalance(account.id, amount))) {
      isSaving.value = false
      return
    }

    isSaving.value = false
    emit('close')
    return
  }

  await store.createAccount(name.value, currency.value, amount, isHidden.value)
  isSaving.value = false
  emit('close')
}
</script>

<template>
  <SheetView :open="true" :title="title" @close="emit('close')">
    <div class="form">
      <FormCard :title="t('acc.title')">
        <FieldRow symbol="textformat" :is-active="isTyping">
          <input
            v-model="name"
            class="form__input"
            type="text"
            :placeholder="t('acc.namePlaceholder')"
            @focus="isTyping = true"
            @blur="isTyping = false"
            @input="error = null"
          />
        </FieldRow>

        <FormDivider />

        <FieldRow symbol="coloncurrencysign.circle">
          <span :class="{ secondary: isCurrencyLocked }">{{ t('common.currency') }}</span>
          <select
            v-model="currency"
            class="form__select"
            :aria-label="t('common.currency')"
            :disabled="isCurrencyLocked"
            @focus="isTyping = true"
            @blur="isTyping = false"
          >
            <option v-for="code in supportedCurrencies" :key="code" :value="code">
              {{ code }} · {{ currencyDisplayName(code) }}
            </option>
          </select>
        </FieldRow>

        <FormDivider />

        <FieldRow symbol="banknote" :is-active="isEditingBalance" as="button" :disabled="isHidden" @click="isTyping = false">
          <span>{{ balanceFieldTitle }}</span>

          <template v-if="isHidden">
            <span class="form__value secondary">{{ hiddenBalanceTitle }}</span>
          </template>
          <template v-else>
            <span class="form__value" :class="{ 'form__value--active': isEditingBalance }">
              <TrailingText :text="balance.display" />
            </span>
            <span class="secondary">{{ currencySymbol(currency) }}</span>
          </template>
        </FieldRow>

        <FormDivider />

        <FieldRow :symbol="isHidden ? 'eye.slash' : 'eye'">
          <label class="form__toggle">
            <span>{{ t('acc.hideBalance') }}</span>
            <input v-model="isHidden" type="checkbox" class="form__switch" />
          </label>
        </FieldRow>
      </FormCard>

      <FormCard v-if="currentBalance !== null" :title="t('acc.balance')">
        <FieldRow symbol="equal.circle">
          <span>{{ t('acc.now') }}</span>
          <span class="form__value secondary numeric">
            {{ isHidden ? hiddenBalanceTitle : formatBalance(currentBalance, currency) }}
          </span>
        </FieldRow>

        <template v-if="correctionMoney && !isHidden">
          <FormDivider />
          <FieldRow symbol="arrow.up.arrow.down.circle">
            <span>{{ t('acc.correction') }}</span>
            <span class="form__value form__value--active numeric">
              {{ formatMoney(correctionMoney, correctionDirection) }}
            </span>
          </FieldRow>
        </template>
      </FormCard>

      <div class="form__notes">
        <InlineMessage v-if="error" kind="error" :text="accountErrorText(error)" />

      </div>
    </div>

    <template #bottom>
      <div class="form__bar liquid-glass">
        <AmountKeypad
          v-if="isEditingBalance"
          @key="
            (key) => {
              balance = balance.input(key)
              error = null
            }
          "
        />

        <AppButton full-width :disabled="isSaving || !hasChanges" @click="submit">
          <AppIcon v-if="isSaving" name="arrow.trianglehead.2.clockwise" :size="16" />
          {{ submitTitle }}
        </AppButton>
      </div>
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

.form__select:disabled {
  color: var(--label-secondary);
}

.form__value {
  margin-left: auto;
  color: var(--label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form__value--active {
  color: var(--accent);
  font-weight: 600;
}

.form__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: var(--space-m);
}

.form__switch {
  width: 51px;
  height: 31px;
  appearance: none;
  border-radius: var(--radius-capsule);
  background: var(--fill-tertiary);
  position: relative;
  transition: background var(--duration-control) var(--ease-control);
  cursor: pointer;
}

.form__switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: transform var(--duration-control) var(--ease-control);
}

.form__switch:checked {
  background: var(--success);
}

.form__switch:checked::after {
  transform: translateX(20px);
}

.form__notes {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.form__bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  padding: var(--space-m);
  border-radius: var(--radius-card);
}
</style>
