<script setup lang="ts">
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
import { OperationRules, operationErrorText, type OperationError } from '@/core/model/rules'
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
          ? 'Дал в долг'
          : 'Взял в долг'
        : isEditingReceived(draft)
          ? 'Зачисление'
          : 'Списание'

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

const noteTitle = computed(() => (draft.kind === 'entry' ? 'Описание' : 'Заметка'))

const hint = computed(() => {
  if (isKindLocked.value) {
    return 'По долгу есть погашения: тип записи и валюта счёта у него уже не меняются, а сумму нельзя уменьшить так, чтобы остаток долга стал отрицательным.'
  }

  if (mode.value.kind === 'editing') {
    return 'Балансы счетов пересчитаются по новым значениям, а запись снова встанет в очередь на выгрузку.'
  }

  return null
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

function onKey(key: AmountKey): void {
  applyKey(draft, key)
  error.value = null
}

function selectSource(id: UUID): void {
  const previous = account.value?.id ?? null
  if (draft.kind === 'transfer' && id === destinationAccount.value?.id) {
    draft.destinationAccountID = previous
  }
  draft.accountID = id
  error.value = null
}

function selectDestination(id: UUID): void {
  const previous = destinationAccount.value?.id ?? null
  if (id === account.value?.id) draft.accountID = previous
  draft.destinationAccountID = id
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

async function submit(): Promise<void> {
  isTyping.value = false

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
      title="Данные не открылись"
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
          Повторить
        </AppButton>
      </template>
    </EmptyState>

    <LoadingView v-else-if="draftState === 'pending'" />

    <EmptyState
      v-else-if="draftState === 'missing'"
      title="Операция не найдена"
      symbol="questionmark.circle"
      description="Возможно, она была удалена."
    />

    <EmptyState
      v-else-if="draftState === 'unsupported'"
      title="Погашение правится в долге"
      symbol="arrow.uturn.backward.circle"
      description="Откройте карточку долга: погашение относится к нему и меняется вместе с его историей."
    />

    <EmptyState
      v-else-if="!canFillForm"
      title="Нет активных счетов"
      symbol="creditcard"
      description="Создайте счёт в разделе «Счета» или верните его из архива — тогда операцию будет куда записать."
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
          label="Тип операции"
          :options="operationFormKinds.map((kind) => ({ value: kind, title: formKindTitle(kind) }))"
          @update:model-value="onKindChange"
        />
      </div>

      <div class="form__body">
        <FormCard v-if="draft.kind === 'entry'">
          <div class="form__picker">
            <SegmentedControl
              v-model="draft.entryKind"
              label="Направление"
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
            <span>Категория</span>
            <span class="form__value secondary">{{ category?.name ?? 'Выберите' }}</span>
            <template #accessory>
              <AppIcon name="chevron.right" :size="14" />
            </template>
          </FieldRow>

          <FormDivider />

          <FieldRow symbol="creditcard">
            <span>Счёт</span>
            <select
              class="form__select"
              :value="account?.id ?? ''"
              aria-label="Счёт"
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
              label="Направление"
              :options="[
                { value: 'given', title: 'Дал' },
                { value: 'taken', title: 'Взял' }
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
              placeholder="Имя контрагента"
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
            <span>Счёт</span>
            <select
              class="form__select"
              :value="account?.id ?? ''"
              aria-label="Счёт"
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
            <span>Со счёта</span>
            <select
              class="form__select"
              :value="account?.id ?? ''"
              aria-label="Со счёта"
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
            <span>Сумма списания</span>
            <span class="form__value" :class="{ 'form__value--active': draft.activeSlot === 'primary' }">
              {{ draft.amount.display }}
            </span>
            <span class="secondary">{{ account ? currencySymbol(account.currency) : '' }}</span>
          </FieldRow>

          <FormDivider />

          <FieldRow symbol="arrow.down.left">
            <span>На счёт</span>
            <select
              class="form__select"
              :value="destinationAccount?.id ?? ''"
              aria-label="На счёт"
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
            <span>Сумма зачисления</span>
            <span class="form__value" :class="{ 'form__value--active': draft.activeSlot === 'received' }">
              {{ draft.receivedAmount.display }}
            </span>
            <span class="secondary">{{ destinationAccount ? currencySymbol(destinationAccount.currency) : '' }}</span>
          </FieldRow>
        </FormCard>

        <FormCard title="Детали">
          <FieldRow symbol="calendar">
            <span>Дата</span>
            <input v-model="dateValue" class="form__date" type="date" aria-label="Дата" />
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
          <InlineMessage v-if="hint" kind="info" :text="hint" />
        </div>
      </div>
    </div>

    <template v-if="phase.kind === 'ready' && draftState === 'ready' && canFillForm" #bottom>
      <div class="form__bar liquid-glass">
        <AmountKeypad v-if="!isTyping" @key="onKey" />

        <AppButton full-width :disabled="!canSave" @click="submit">Сохранить</AppButton>
      </div>
    </template>
  </SheetView>

  <ConfirmDialog
    :open="actionError !== null"
    :title="modeFailureTitle(mode)"
    :message="actionError ?? ''"
    confirm-title="Понятно"
    cancel-title="Закрыть"
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
