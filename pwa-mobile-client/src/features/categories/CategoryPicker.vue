<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import CategoryBadge from '@/design/CategoryBadge.vue'
import EmptyState from '@/design/EmptyState.vue'
import SheetView from '@/design/SheetView.vue'
import CategoryFormSheet from './CategoryFormSheet.vue'
import { kindPluralTitle, type CategoryKind, type UUID } from '@/core/model/ledger'
import { ledgerStore as store } from '@/core/store/ledgerStore'

const props = defineProps<{ kind: CategoryKind; selection: UUID | null }>()
const emit = defineEmits<{ select: [UUID]; close: [] }>()

const isCreating = ref(false)

const categories = computed(() => store.availableCategories(props.kind))
</script>

<template>
  <SheetView :open="true" :title="kindPluralTitle(kind)" detent="medium" @close="emit('close')">
    <template #action>
      <button type="button" class="picker__add" aria-label="Новая категория" @click="isCreating = true">
        <AppIcon name="plus" :size="20" />
      </button>
    </template>

    <EmptyState
      v-if="categories.length === 0"
      title="Категорий пока нет"
      symbol="tag"
      description="Создайте первую — она сразу встанет в операцию."
    >
      <template #actions>
        <AppButton @click="isCreating = true">Новая категория</AppButton>
      </template>
    </EmptyState>

    <div v-else class="picker">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="picker__cell"
        :class="{ 'picker__cell--selected': category.id === selection }"
        :aria-pressed="category.id === selection"
        @click="emit('select', category.id)"
      >
        <CategoryBadge :symbol="category.symbolName" :color="category.color" :size="48" />
        <span class="picker__name text-footnote">{{ category.name }}</span>
      </button>
    </div>
  </SheetView>

  <CategoryFormSheet
    v-if="isCreating"
    :kind="kind"
    @created="
      (category) => {
        isCreating = false
        if (category.kinds.includes(kind)) emit('select', category.id)
      }
    "
    @close="isCreating = false"
  />
</template>

<style scoped>
.picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: var(--space-m);
  padding: var(--space-l);
}

.picker__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-m) var(--space-s);
  border-radius: var(--radius-card);
  background: var(--field-background);
  border: 2px solid transparent;
}

.picker__cell--selected {
  border-color: var(--accent);
}

.picker__name {
  text-align: center;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.picker__add {
  color: var(--accent);
  display: inline-flex;
}
</style>
