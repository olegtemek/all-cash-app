<script setup lang="ts">
import { t } from '@/core/i18n'
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import ConfirmDialog from '@/design/ConfirmDialog.vue'
import EmptyState from '@/design/EmptyState.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import InlineMessage from '@/design/InlineMessage.vue'
import LoadingView from '@/design/LoadingView.vue'
import SegmentedControl from '@/design/SegmentedControl.vue'
import SheetView from '@/design/SheetView.vue'
import AmountDisplay from './AmountDisplay.vue'
import AmountKeypad from './AmountKeypad.vue'
import CategoryPicker from '@/features/categories/CategoryPicker.vue'
import {
  activeAmount,
  applyKey,
  draftDiffers,
  draftFromOperation,
  emptyDraft,
  formKindTitle,
  isEditingReceived,
  modeFailureTitle,
  modeTitle,
  operationFormKinds,
  type AmountSlot,
  type OperationDraft,
  type OperationFormMode
} from './draft'
import type { AmountKey } from '@/core/model/amountExpression'
import { fromDateInputValue, toDateInputValue } from '@/core/model/dates'
import { categoryKinds, kindTitle, type Account, type Payload, type UUID } from '@/core/model/ledger'
import { currencySymbol, money, preferredCurrency, type CurrencyCode, type Direction } from '@/core/model/money'
import {
  DebtRules,
  OperationRules,
  operationErrorText,
  repaymentErrorText,
  type OperationError,
  type RepaymentError
} from '@/core/model/rules'
import { ledgerStore as store } from '@/core/store/ledgerStore'

const props = defineProps<{ editingId?: string | null }>()
const emit = defineEmits<{ close: [] }>()

type DraftState = 'ready' | 'pending' | 'missing' | 'unsupported'

const mode = computed<OperationFormMode>(() =>
  props.editingId ? { kind: 'editing', id: props.editingId } : { kind: 'creating' }
)

const draft = reactive(emptyDraft()) as OperationDraft
const original = shallowRef<OperationDraft | null>(null)
const draftState = ref<DraftState>(props.editingId ? 'pending' : 'ready')
const error = ref<OperationError | null>(null)
const repayError = ref<RepaymentError | null>(null)
const isSaving = ref(false)
const isChoosingCategory = ref(false)
const isTyping = ref(false)

const phase = store.phase
const actionError = store.actionError

const accounts = computed<Account[]>(() => store.selectableAccounts())

const account = computed<Account | null>(
  () => store.account(draft.accountID) ?? store.account(store.suggestedAccountID.value)
)

const destinationAccount = computed<Account | null>(() => {
  const chosen = store.account(draft.destinationAccountID)
  if (chosen && chosen.id !== account.value?.id) return chosen
  return accounts.value.find((item) => item.id !== account.value?.id) ?? null
})

const category = computed(() => store.category(draft.categoryID))

const activeCurrency = computed<CurrencyCode>(() => {
  const source = isEditingReceived(draft) ? destinationAccount.value : account.value
  return source?.currency ?? preferredCurrency()
})

const activeDirection = computed<Direction>(() => {
  switch (draft.kind) {
    case 'entry':
      return draft.entryKind === 'expense' ? 'outgoing' : 'incoming'
    case 'debt':
      return draft.debtDirection === 'given' ? 'outgoing' : 'incoming'
    case 'transfer':
      return isEditingReceived(draft) ? 'incoming' : 'outgoing'
  }
})

const amountCaption = computed(() => {
  const name = (isEditingReceived(draft) ? destinationAccount.value : account.value)?.name

  const title =
    draft.kind === 'entry'
      ? kindTitle(draft.entryKind)
      : draft.kind === 'debt'
        ? draft.debtDirection === 'given'
          ? t('debt.gave')
          : t('debt.took')
        : isEditingReceived(draft)
          ? t('form.slot.crediting')
          : t('form.slot.spending')

  return name ? `${title} · ${name}` : title
})

const hasAccounts = computed(() => accounts.value.length > 0)
const canFillForm = computed(() => hasAccounts.value || mode.value.kind === 'editing')

const minimumPrincipal = computed(() => {
  const id = mode.value.kind === 'editing' ? mode.value.id : null
  return id ? store.minimumPrincipal(id) : null
})

const isKindLocked = computed(() => minimumPrincipal.value !== null)

const canSave = computed(() => {
  if (isSaving.value) return false
  const baseline = original.value
  return baseline ? draftDiffers(draft, baseline) : true
})

const suggestions = computed(() => store.counterpartySuggestions(draft.counterparty))

const noteTitle = computed(() => (draft.kind === 'entry' ? t('form.note.description') : t('form.note.note')))

// «Дал» тому, кто мне должен (или «взял» у того, кому должен), — это погашение текущего долга.
const repaidDebt = computed(() => {
  if (mode.value.kind !== 'creating' || draft.kind !== 'debt') return null
  const name = draft.counterparty.trim().toLowerCase()
  if (name.length === 0) return null

  const opposite = draft.debtDirection === 'given' ? store.owedByUser.value : store.owedToUser.value
  return (
    opposite.find(
      (debt) =>
        debt.counterparty.toLowerCase() === name &&
        (account.value === null || debt.outstanding.currency === account.value.currency)
    ) ?? null
  )
})


const dateValue = computed({
  get: () => toDateInputValue(draft.date),
  set: (raw: string) => {
    draft.date = fromDateInputValue(raw, draft.date)
  }
})

onMounted(async () => {
  await store.loadIfNeeded()
  prepareDraft()
})

watch(
  () => phase.value.kind,
  () => prepareDraft()
)

function prepareDraft(): void {
  if (phase.value.kind !== 'ready') return
  if (mode.value.kind !== 'editing' || draftState.value !== 'pending') return

  const operation = store.operation(mode.value.id)
  if (!operation) {
    draftState.value = 'missing'
    return
  }

  const filled = draftFromOperation(operation)
  if (!filled) {
    draftState.value = 'unsupported'
    return
  }

  Object.assign(draft, filled)
  original.value = { ...filled }
  draftState.value = 'ready'
}

function mirrorReceivedAmount(): void {
  if (draft.kind !== 'transfer' || isEditingReceived(draft)) return
  const from = account.value
  const to = destinationAccount.value
  if (from && to && from.currency === to.currency) draft.receivedAmount = draft.amount
}

function onKey(key: AmountKey): void {
  repayError.value = null
  applyKey(draft, key)
  mirrorReceivedAmount()
  error.value = null
}

function selectSource(id: UUID): void {
  const previous = account.value?.id ?? null
  if (draft.kind === 'transfer' && id === destinationAccount.value?.id) {
    draft.destinationAccountID = previous
  }
  draft.accountID = id
  mirrorReceivedAmount()
  error.value = null
}

function selectDestination(id: UUID): void {
  const previous = destinationAccount.value?.id ?? null
  if (id === account.value?.id) draft.accountID = previous
  draft.destinationAccountID = id
  mirrorReceivedAmount()
  error.value = null
}

function selectSlot(slot: AmountSlot): void {
  isTyping.value = false
  draft.activeSlot = slot
}

function onKindChange(): void {
  draft.activeSlot = 'primary'
  error.value = null
}

function onEntryKindChange(): void {
  const current = category.value
  if (!current || !current.kinds.includes(draft.entryKind)) draft.categoryID = null
  error.value = null
}

function validatedPayload(): Payload | null {
  switch (draft.kind) {
    case 'entry': {
      const failure = OperationRules.validateEntry(draft.amount, account.value, category.value)
      if (failure) {
        error.value = failure
        return null
      }

      const amount = draft.amount.value
      const selectedAccount = account.value
      const selectedCategory = category.value
      if (!amount.ok || !selectedAccount || !selectedCategory) return null

      const value = money(amount.value, selectedAccount.currency)
      return draft.entryKind === 'expense'
        ? { kind: 'expense', category: selectedCategory.id, account: selectedAccount.id, amount: value }
        : { kind: 'income', category: selectedCategory.id, account: selectedAccount.id, amount: value }
    }

    case 'debt': {
      if (repaidDebt.value) return null
      const failure = OperationRules.validateDebt(draft.amount, account.value, draft.counterparty)
      if (failure) {
        error.value = failure
        return null
      }

      const amount = draft.amount.value
      const selectedAccount = account.value
      if (!amount.ok || !selectedAccount) return null

      const minimum = minimumPrincipal.value
      if (minimum) {
        const editFailure = OperationRules.validateDebtEdit(amount.value, selectedAccount, minimum)
        if (editFailure) {
          error.value = editFailure
          return null
        }
      }

      return {
        kind: 'debt',
        direction: draft.debtDirection,
        counterparty: draft.counterparty.trim(),
        account: selectedAccount.id,
        amount: money(amount.value, selectedAccount.currency)
      }
    }

    case 'transfer': {
      const failure = OperationRules.validateTransfer(
        draft.amount,
        account.value,
        draft.receivedAmount,
        destinationAccount.value
      )
      if (failure) {
        error.value = failure
        return null
      }

      const spent = draft.amount.value
      const received = draft.receivedAmount.value
      const from = account.value
      const to = destinationAccount.value
      if (!spent.ok || !received.ok || !from || !to) return null

      return {
        kind: 'transfer',
        from: from.id,
        spent: money(spent.value, from.currency),
        to: to.id,
        received: money(received.value, to.currency)
      }
    }
  }
}

async function repay(): Promise<void> {
  const debt = repaidDebt.value
  const amount = draft.amount.value
  if (!debt) return

  const value = amount.ok ? amount.value : null
  const failure = DebtRules.validateRepayment(value, debt.outstanding, account.value)
  if (failure) {
    repayError.value = failure
    return
  }
  if (value === null || !account.value) return

  isSaving.value = true
  await store.repay(debt, value, account.value, draft.date)
  isSaving.value = false
  emit('close')
}

async function submit(): Promise<void> {
  isTyping.value = false
  repayError.value = null

  if (repaidDebt.value) {
    await repay()
    return
  }

  const payload = validatedPayload()
  if (!payload) return

  isSaving.value = true
  const saved =
    mode.value.kind === 'editing'
      ? await store.update(mode.value.id, draft.date, draft.note, payload)
      : await store.record(draft.date, draft.note, payload)
  isSaving.value = false

  if (saved) emit('close')
}
</script>

<template>
  <SheetView :open="true" :title="modeTitle(mode)" @close="emit('close')">
    <LoadingView v-if="phase.kind === 'loading'" />

    <EmptyState
      v-else-if="phase.kind === 'failed'"
      :title="t('form.dataFailed')"
      symbol="exclamationmark.triangle"
      :description="phase.message"
    >
      <template #actions>
        <AppButton
          @click="
            async () => {
              await store.load()
              prepareDraft()
            }
          "
        >
          {{ t('common.retry') }}
        </AppButton>
      </template>
    </EmptyState>

    <LoadingView v-else-if="draftState === 'pending'" />

    <EmptyState
      v-else-if="draftState === 'missing'"
      :title="t('common.operationNotFound')"
      symbol="questionmark.circle"
    />

    <EmptyState
      v-else-if="draftState === 'unsupported'"
      :title="t('form.repaymentInDebt')"
      symbol="arrow.uturn.backward.circle"
    />

    <EmptyState
      v-else-if="!canFillForm"
      :title="t('form.noAccounts')"
      symbol="creditcard"
    />

    <div v-else class="form">
      <div class="form__header">
        <AmountDisplay
          :caption="amountCaption"
          :expression="activeAmount(draft)"
          :currency="activeCurrency"
          :direction="activeDirection"
        />

        <SegmentedControl
          v-if="!isKindLocked"
          v-model="draft.kind"
          :label="t('form.operationType')"
          :options="operationFormKinds.map((kind) => ({ value: kind, title: formKindTitle(kind) }))"
          @update:model-value="onKindChange"
        />
      </div>

      <div class="form__body">
        <FormCard v-if="draft.kind === 'entry'">
          <div class="form__picker">
            <SegmentedControl
              v-model="draft.entryKind"
              :label="t('common.direction')"
              :options="categoryKinds.map((kind) => ({ value: kind, title: kindTitle(kind) }))"
              @update:model-value="onEntryKindChange"
            />
          </div>

          <FormDivider />

          <FieldRow
            :symbol="category?.symbolName ?? 'tag'"
            as="button"
            @click="
              () => {
                isTyping = false
                isChoosingCategory = true
              }
            "
          >
            <span>{{ t('common.category') }}</span>
            <span class="form__value secondary">{{ category?.name ?? t('form.choose') }}</span>
            <template #accessory>
              <AppIcon name="chevron.right" :size="14" />
            </template>
          </FieldRow>

          <FormDivider />

          <FieldRow symbol="creditcard">
            <span>{{ t('common.account') }}</span>
            <select
              class="form__select"
              :value="account?.id ?? ''"
              :aria-label="t('common.account')"
              @change="selectSource(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="item in accounts" :key="item.id" :value="item.id">
                {{ item.name }} · {{ item.currency }}
              </option>
            </select>
          </FieldRow>
        </FormCard>

        <FormCard v-else-if="draft.kind === 'debt'">
          <div class="form__picker">
            <SegmentedControl
              v-model="draft.debtDirection"
              :label="t('common.direction')"
              :options="[
                { value: 'given', title: t('form.gave') },
                { value: 'taken', title: t('form.took') }
              ]"
              @update:model-value="error = null"
            />
          </div>

          <FormDivider />

          <FieldRow symbol="person" :is-active="isTyping">
            <input
              v-model="draft.counterparty"
              class="form__input"
              type="text"
              :placeholder="t('form.counterpartyPlaceholder')"
              autocomplete="off"
              @focus="isTyping = true"
              @blur="isTyping = false"
              @input="error = null"
            />
          </FieldRow>

          <div v-if="suggestions.length > 0" class="form__suggestions">
            <button
              v-for="name in suggestions"
              :key="name"
              type="button"
              class="form__chip"
              @click="draft.counterparty = name"
            >
              {{ name }}
            </button>
          </div>

          <FormDivider />

          <FieldRow symbol="creditcard">
            <span>{{ t('common.account') }}</span>
            <select
              class="form__select"
              :value="account?.id ?? ''"
              :aria-label="t('common.account')"
              @change="selectSource(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="item in accounts" :key="item.id" :value="item.id">
                {{ item.name }} · {{ item.currency }}
              </option>
            </select>
          </FieldRow>
        </FormCard>

        <FormCard v-else>
          <FieldRow symbol="arrow.up.right">
            <span>{{ t('form.fromAccount') }}</span>
            <select
              class="form__select"
              :value="account?.id ?? ''"
              :aria-label="t('form.fromAccount')"
              @change="selectSource(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="item in accounts" :key="item.id" :value="item.id">
                {{ item.name }} · {{ item.currency }}
              </option>
            </select>
          </FieldRow>

          <FormDivider />

          <FieldRow
            symbol="banknote"
            as="button"
            :is-active="draft.activeSlot === 'primary'"
            @click="selectSlot('primary')"
          >
            <span>{{ t('form.spentAmount') }}</span>
            <span class="form__value" :class="{ 'form__value--active': draft.activeSlot === 'primary' }">
              {{ draft.amount.display }}
            </span>
            <span class="secondary">{{ account ? currencySymbol(account.currency) : '' }}</span>
          </FieldRow>

          <FormDivider />

          <FieldRow symbol="arrow.down.left">
            <span>{{ t('form.toAccount') }}</span>
            <select
              class="form__select"
              :value="destinationAccount?.id ?? ''"
              :aria-label="t('form.toAccount')"
              @change="selectDestination(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="item in accounts" :key="item.id" :value="item.id">
                {{ item.name }} · {{ item.currency }}
              </option>
            </select>
          </FieldRow>

          <FormDivider />

          <FieldRow
            symbol="banknote"
            as="button"
            :is-active="draft.activeSlot === 'received'"
            @click="selectSlot('received')"
          >
            <span>{{ t('form.receivedAmount') }}</span>
            <span class="form__value" :class="{ 'form__value--active': draft.activeSlot === 'received' }">
              {{ draft.receivedAmount.display }}
            </span>
            <span class="secondary">{{ destinationAccount ? currencySymbol(destinationAccount.currency) : '' }}</span>
          </FieldRow>
        </FormCard>

        <FormCard :title="t('form.details')">
          <FieldRow symbol="calendar">
            <span>{{ t('common.date') }}</span>
            <input v-model="dateValue" class="form__date" type="date" :aria-label="t('common.date')" />
          </FieldRow>

          <FormDivider />

          <FieldRow symbol="text.alignleft" :is-active="isTyping">
            <input
              v-model="draft.note"
              class="form__input"
              type="text"
              :placeholder="noteTitle"
              @focus="isTyping = true"
              @blur="isTyping = false"
            />
          </FieldRow>
        </FormCard>

        <div class="form__notes">
          <InlineMessage v-if="error" kind="error" :text="operationErrorText(error)" />
          <InlineMessage v-if="repayError" kind="error" :text="repaymentErrorText(repayError)" />
        </div>
      </div>
    </div>

    <template v-if="phase.kind === 'ready' && draftState === 'ready' && canFillForm" #bottom>
      <div class="form__bar liquid-glass">
        <AmountKeypad v-if="!isTyping" @key="onKey" />

        <AppButton full-width :disabled="!canSave" @click="submit">{{ t('common.save') }}</AppButton>
      </div>
    </template>
  </SheetView>

  <ConfirmDialog
    :open="actionError !== null"
    :title="modeFailureTitle(mode)"
    :message="actionError ?? ''"
    :confirm-title="t('common.gotIt')"
    :cancel-title="t('common.close')"
    :destructive="false"
    @confirm="actionError = null"
    @cancel="actionError = null"
  />

  <CategoryPicker
    v-if="isChoosingCategory"
    :kind="draft.entryKind"
    :selection="draft.categoryID"
    @select="
      (id) => {
        draft.categoryID = id
        isChoosingCategory = false
        error = null
      }
    "
    @close="isChoosingCategory = false"
  />
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
}

.form__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
  padding: var(--space-s) var(--space-l) var(--space-l);
}

.form__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: 0 var(--space-l) var(--space-l);
}

.form__picker {
  padding: var(--space-m) var(--space-l);
  background: var(--field-background);
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
}

.form__select {
  margin-left: auto;
  max-width: 55%;
  padding: 4px 0;
  border: none;
  background: none;
  color: var(--accent);
  text-align: right;
  text-align-last: right;
}

.form__input {
  width: 100%;
  border: none;
  background: none;
  outline: none;
  font-size: 17px;
}

.form__input::placeholder {
  color: var(--label-tertiary);
}

.form__date {
  margin-left: auto;
  border: none;
  background: none;
  color: var(--label-secondary);
  font-size: 17px;
}

.form__suggestions {
  display: flex;
  gap: var(--space-s);
  padding: 0 var(--space-l) var(--space-m);
  overflow-x: auto;
  background: var(--field-background);
}

.form__chip {
  flex: 0 0 auto;
  padding: 6px var(--space-m);
  border-radius: var(--radius-capsule);
  background: var(--fill-tertiary);
  font-size: 13px;
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
