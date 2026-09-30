<script setup lang="ts">
import { t } from '@/core/i18n'
import { onMounted, ref, watch } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import ScreenHeader from '@/design/ScreenHeader.vue'
import SheetView from '@/design/SheetView.vue'
import EraseDataCard from './EraseDataCard.vue'
import CategoriesView from '@/features/categories/CategoriesView.vue'
import ExportCard from '@/features/export/ExportCard.vue'
import SignInView from '@/features/auth/SignInView.vue'
import SyncCard from '@/features/sync/SyncCard.vue'
import { authStore as auth } from '@/features/auth/authStore'
import { ledgerStore as ledger } from '@/core/store/ledgerStore'
import { appLocale, setStoredLocale, supportedLocales, type AppLocale } from '@/core/model/locale'
import type { MessageKey } from '@/core/i18n'

const language = ref<AppLocale>(appLocale)

watch(language, (next) => {
  if (next === appLocale) return
  setStoredLocale(next)
  window.location.reload()
})

const isSigningIn = ref(false)
const isShowingCategories = ref(false)

onMounted(() => {
  void ledger.loadIfNeeded()
})
</script>

<template>
  <div class="screen">
    <ScreenHeader :title="t('tabs.settings')" />

    <div class="screen__body">
      <FormCard :title="t('common.server')">
        <template v-if="auth.session.value">
          <FieldRow symbol="person">
            <span>{{ t('common.login') }}</span>
            <span class="screen__value secondary">{{ auth.session.value.login }}</span>
          </FieldRow>

          <FormDivider />

          <FieldRow symbol="server.rack">
            <span>{{ t('common.server') }}</span>
            <span class="screen__value secondary">{{ auth.session.value.server }}</span>
          </FieldRow>
        </template>

        <FieldRow v-else symbol="person.badge.key" as="button" @click="isSigningIn = true">
          <span>{{ t('settings.signInToServer') }}</span>
          <template #accessory>
            <AppIcon name="chevron.right" :size="14" />
          </template>
        </FieldRow>
      </FormCard>

      <SyncCard />

      <ExportCard />

      <FormCard :title="t('common.categories')">
        <FieldRow symbol="tag" as="button" @click="isShowingCategories = true">
          <span>{{ t('settings.allCategories') }}</span>
          <span class="screen__value secondary">{{ ledger.allCategories.value.length }}</span>
          <template #accessory>
            <AppIcon name="chevron.right" :size="14" />
          </template>
        </FieldRow>
      </FormCard>

      <FormCard :title="t('settings.language')">
        <FieldRow symbol="globe" as="label">
          <span>{{ t('settings.language') }}</span>
          <select v-model="language" class="screen__select" :aria-label="t('settings.language')">
            <option v-for="item in supportedLocales" :key="item" :value="item">
              {{ t(`settings.languageName.${item}` as MessageKey) }}
            </option>
          </select>
        </FieldRow>
      </FormCard>

      <EraseDataCard />

      <AppButton v-if="auth.isSignedIn.value" variant="glass" tone="danger" full-width @click="auth.signOut()">
        <AppIcon name="rectangle.portrait.and.arrow.right" :size="18" />
        {{ t('settings.signOut') }}
      </AppButton>
    </div>

    <SignInView v-if="isSigningIn" @close="isSigningIn = false" />

    <SheetView
      :open="isShowingCategories"
      :title="t('settings.allCategories')"
      :cancel-title="t('common.back')"
      @close="isShowingCategories = false"
    >
      <CategoriesView />
    </SheetView>
  </div>
</template>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.screen__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: 0 var(--space-l) var(--space-xl);
}

.screen__select {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--color-secondary, inherit);
  font: inherit;
  text-align: right;
}

.screen__value {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
</style>
