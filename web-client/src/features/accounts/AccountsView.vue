<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import ConfirmDialog from '@/design/ConfirmDialog.vue'
import EmptyState from '@/design/EmptyState.vue'
import LoadingView from '@/design/LoadingView.vue'
import ScreenHeader from '@/design/ScreenHeader.vue'
import SwipeRow from '@/design/SwipeRow.vue'
import type { SwipeAction } from '@/design/swipeAction'
import AccountFormSheet from './AccountFormSheet.vue'
import DebtDetailView from './DebtDetailView.vue'
import { paletteVar } from '@/core/model/palette'
import { formatBalance, spokenBalance } from '@/core/model/money'
import { ledgerStore as store } from '@/core/store/ledgerStore'
import {
  accountAccessibilityLabel,
  accountBalanceTitle,
  debtStateTitle,
  type AccountSummary,
  type DebtSummary
} from '@/core/store/models'
import type { Account } from '@/core/model/ledger'

const archiveActions: SwipeAction[] = [{ id: 'archive', title: 'В архив', symbol: 'archivebox', tone: 'warning' }]
const restoreActions: SwipeAction[] = [
  { id: 'restore', title: 'Вернуть', symbol: 'tray.and.arrow.up', tone: 'accent' }
]

const isCreatingAccount = ref(false)
const editingAccount = ref<Account | null>(null)
const openDebtID = ref<string | null>(null)

const phase = store.phase
const actionError = store.actionError

const archived = store.archivedAccounts

const editedBalance = computed(() => {
  const account = editingAccount.value
  if (!account) return 0
  return store.accountSummary(account.id)?.balance ?? account.initialBalance
})

function subtitle(account: AccountSummary): string {
  if (account.isArchived) return `В архиве · ${account.currencyName}`
  if (account.isHidden) return `Баланс скрыт · ${account.currencyName}`
  return account.currencyName
}

function debtLabel(debt: DebtSummary): string {
  return `${debt.counterparty}, ${debtStateTitle(debt)}, остаток ${spokenBalance(debt.outstanding.amount, debt.outstanding.currency)}`
}

onMounted(() => {
  void store.loadIfNeeded()
})
</script>

<template>
  <div class="screen">
    <ScreenHeader title="Счета">
      <template #trailing>
        <AppButton variant="glass" class="screen__action" @click="isCreatingAccount = true">Новый счёт</AppButton>
      </template>
    </ScreenHeader>

    <LoadingView v-if="phase.kind === 'loading'" />

    <EmptyState
      v-else-if="phase.kind === 'failed'"
      title="Счета не открылись"
      symbol="exclamationmark.triangle"
      :description="phase.message"
    >
      <template #actions>
        <AppButton @click="store.load()">Повторить</AppButton>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="!store.hasAccounts.value"
      title="Счетов пока нет"
      symbol="creditcard"
      description="Создайте счёт, чтобы записывать по нему операции."
    >
      <template #actions>
        <AppButton @click="isCreatingAccount = true">Создать счёт</AppButton>
      </template>
    </EmptyState>

    <div v-else class="list">
      <section class="list__section">
        <h2 class="list__title text-subheadline">Счета</h2>

        <div class="list__card">
          <SwipeRow
            v-for="account in store.accounts.value"
            :key="account.id"
            :actions="archiveActions"
            @action="store.setArchived(true, account.id)"
            @press="editingAccount = store.account(account.id)"
          >
            <div class="account" :aria-label="accountAccessibilityLabel(account)">
              <span class="account__code">{{ account.currency }}</span>

              <span class="account__text">
                <span>{{ account.name }}</span>
                <span class="text-footnote secondary">{{ subtitle(account) }}</span>
              </span>

              <span class="account__balance numeric">{{ accountBalanceTitle(account) }}</span>
            </div>
          </SwipeRow>
        </div>
      </section>

      <section v-if="store.owedToUser.value.length > 0" class="list__section">
        <h2 class="list__title text-subheadline">Мне должны</h2>
        <div class="list__card">
          <button
            v-for="debt in store.owedToUser.value"
            :key="debt.id"
            type="button"
            class="debt"
            :aria-label="debtLabel(debt)"
            @click="openDebtID = debt.id"
          >
            <span class="debt__icon" :style="{ background: paletteVar('orange') }">
              <AppIcon name="person.crop.circle.badge.minus" :size="16" />
            </span>

            <span class="debt__text">
              <span>{{ debt.counterparty }}</span>
              <span class="text-footnote secondary">{{ debtStateTitle(debt) }}</span>
            </span>

            <span class="debt__amounts">
              <span class="numeric">{{ formatBalance(debt.outstanding.amount, debt.outstanding.currency) }}</span>
              <span v-if="debt.repayments.length > 0" class="text-footnote secondary numeric">
                из {{ formatBalance(debt.principal.amount, debt.principal.currency) }}
              </span>
            </span>
          </button>
        </div>
      </section>

      <section v-if="store.owedByUser.value.length > 0" class="list__section">
        <h2 class="list__title text-subheadline">Я должен</h2>
        <div class="list__card">
          <button
            v-for="debt in store.owedByUser.value"
            :key="debt.id"
            type="button"
            class="debt"
            :aria-label="debtLabel(debt)"
            @click="openDebtID = debt.id"
          >
            <span class="debt__icon" :style="{ background: paletteVar('blue') }">
              <AppIcon name="person.crop.circle.badge.plus" :size="16" />
            </span>

            <span class="debt__text">
              <span>{{ debt.counterparty }}</span>
              <span class="text-footnote secondary">{{ debtStateTitle(debt) }}</span>
            </span>

            <span class="debt__amounts">
              <span class="numeric">{{ formatBalance(debt.outstanding.amount, debt.outstanding.currency) }}</span>
              <span v-if="debt.repayments.length > 0" class="text-footnote secondary numeric">
                из {{ formatBalance(debt.principal.amount, debt.principal.currency) }}
              </span>
            </span>
          </button>
        </div>
      </section>

      <section v-if="archived.length > 0" class="list__section">
        <h2 class="list__title text-subheadline">Архив</h2>

        <div class="list__card">
          <SwipeRow
            v-for="account in archived"
            :key="account.id"
            :actions="restoreActions"
            @action="store.setArchived(false, account.id)"
            @press="editingAccount = store.account(account.id)"
          >
            <div class="account" :aria-label="accountAccessibilityLabel(account)">
              <span class="account__code account__code--archived">{{ account.currency }}</span>

              <span class="account__text">
                <span>{{ account.name }}</span>
                <span class="text-footnote secondary">{{ subtitle(account) }}</span>
              </span>

              <span class="account__balance account__balance--muted numeric">{{ accountBalanceTitle(account) }}</span>
            </div>
          </SwipeRow>
        </div>

        <p class="list__footer text-footnote secondary">
          Архивный счёт не предлагается в новых операциях, его записи остаются в ленте.
        </p>
      </section>
    </div>

    <AccountFormSheet v-if="isCreatingAccount" @close="isCreatingAccount = false" />

    <AccountFormSheet
      v-if="editingAccount"
      :editing="editingAccount"
      :balance="editedBalance"
      @close="editingAccount = null"
    />

    <DebtDetailView v-if="openDebtID" :debt-id="openDebtID" @close="openDebtID = null" />

    <ConfirmDialog
      :open="actionError !== null"
      title="Не получилось"
      :message="actionError ?? ''"
      confirm-title="Понятно"
      cancel-title="Закрыть"
      :destructive="false"
      @confirm="actionError = null"
      @cancel="actionError = null"
    />
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.screen__action {
  min-height: 36px;
  padding: 0 var(--space-m);
  font-size: 15px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
  padding: 0 var(--space-l) var(--space-xl);
}

.list__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.list__title {
  margin: 0;
  padding: 0 var(--space-xs);
  font-weight: 600;
}

.list__card {
  background: var(--field-background);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.list__footer {
  margin: 0;
  padding: 0 var(--space-xs);
}

.account,
.debt {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  width: 100%;
  padding: var(--space-m) var(--space-l);
  background: var(--field-background);
  text-align: left;
}

.account__code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 46px;
  height: 36px;
  border-radius: var(--radius-icon);
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.account__code--archived {
  background: var(--palette-graphite);
}

.account__text,
.debt__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.account__text > span:first-child,
.debt__text > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account__balance {
  flex: 0 0 auto;
  font-weight: 500;
}

.account__balance--muted {
  color: var(--label-secondary);
}

.debt__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-icon);
  color: #fff;
}

.debt__amounts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex: 0 0 auto;
  font-weight: 500;
}
</style>
