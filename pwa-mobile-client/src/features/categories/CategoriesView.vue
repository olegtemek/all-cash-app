<script setup lang="ts">
import { t } from '@/core/i18n'
import { computed, onMounted, ref } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import CategoryBadge from '@/design/CategoryBadge.vue'
import EmptyState from '@/design/EmptyState.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import CategoryFormSheet from './CategoryFormSheet.vue'
import { categoryApplies, categoryKinds, kindPluralTitle, kindsTitle, type Category } from '@/core/model/ledger'
import { ledgerStore as store } from '@/core/store/ledgerStore'

const isCreating = ref(false)
const editing = ref<Category | null>(null)

const groups = computed(() =>
  categoryKinds
    .map((kind) => ({
      kind,
      title: kindPluralTitle(kind),
      categories: store.allCategories.value.filter((category) => categoryApplies(category, kind))
    }))
    .filter((group) => group.categories.length > 0)
)

onMounted(() => {
  void store.loadIfNeeded()
})
</script>

<template>
  <div class="screen">
    <EmptyState
      v-if="store.allCategories.value.length === 0"
      :title="t('cat.none')"
      symbol="tag"
    >
      <template #actions>
        <AppButton @click="isCreating = true">{{ t('common.newCategory') }}</AppButton>
      </template>
    </EmptyState>

    <div v-else class="screen__body">
      <FormCard v-for="group in groups" :key="group.kind" :title="group.title">
        <template v-for="(category, index) in group.categories" :key="category.id">
          <FormDivider v-if="index > 0" :inset="60" />

          <button type="button" class="category" @click="editing = category">
            <CategoryBadge :symbol="category.symbolName" :color="category.color" :size="32" />

            <span class="category__text">
              <span>{{ category.name }}</span>
              <span v-if="category.kinds.length > 1" class="text-footnote secondary">
                {{ kindsTitle(category.kinds) }}
              </span>
            </span>

            <AppIcon name="chevron.right" :size="14" class="tertiary" />
          </button>
        </template>
      </FormCard>

      <AppButton variant="glass" full-width @click="isCreating = true">
        <AppIcon name="plus" :size="18" />
        {{ t('common.newCategory') }}
      </AppButton>
    </div>

    <CategoryFormSheet v-if="isCreating" kind="expense" @created="isCreating = false" @close="isCreating = false" />
    <CategoryFormSheet v-if="editing" :editing="editing" @close="editing = null" />
  </div>
</template>

<style scoped>
.screen {
  min-height: 100%;
}

.screen__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding: var(--space-l) var(--space-l) var(--space-xl);
}

.category {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  width: 100%;
  min-height: 56px;
  padding: var(--space-m) var(--space-l);
  background: var(--field-background);
  text-align: left;
}

.category__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}
</style>
