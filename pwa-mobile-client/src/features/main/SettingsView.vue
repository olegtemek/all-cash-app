<script setup lang="ts">
import { onMounted, ref } from 'vue'
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

const isSigningIn = ref(false)
const isShowingCategories = ref(false)

onMounted(() => {
  void ledger.loadIfNeeded()
})
</script>

<template>
  <div class="screen">
    <ScreenHeader title="Настройки" />

    <div class="screen__body">
      <FormCard title="Сервер">
        <template v-if="auth.session.value">
          <FieldRow symbol="person">
            <span>Логин</span>
            <span class="screen__value secondary">{{ auth.session.value.login }}</span>
          </FieldRow>

          <FormDivider />

          <FieldRow symbol="server.rack">
            <span>Сервер</span>
            <span class="screen__value secondary">{{ auth.session.value.server }}</span>
          </FieldRow>
        </template>

        <FieldRow v-else symbol="person.badge.key" as="button" @click="isSigningIn = true">
          <span>Войти на сервер</span>
          <template #accessory>
            <AppIcon name="chevron.right" :size="14" />
          </template>
        </FieldRow>
      </FormCard>

      <SyncCard />

      <ExportCard />

      <FormCard title="Категории">
        <FieldRow symbol="tag" as="button" @click="isShowingCategories = true">
          <span>Все категории</span>
          <span class="screen__value secondary">{{ ledger.allCategories.value.length }}</span>
          <template #accessory>
            <AppIcon name="chevron.right" :size="14" />
          </template>
        </FieldRow>
      </FormCard>

      <EraseDataCard />

      <AppButton v-if="auth.isSignedIn.value" variant="glass" tone="danger" full-width @click="auth.signOut()">
        <AppIcon name="rectangle.portrait.and.arrow.right" :size="18" />
        Выйти
      </AppButton>
    </div>

    <SignInView v-if="isSigningIn" @close="isSigningIn = false" />

    <SheetView
      :open="isShowingCategories"
      title="Все категории"
      cancel-title="Назад"
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

.screen__value {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
</style>
