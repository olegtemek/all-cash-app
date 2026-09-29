<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '@/design/AppButton.vue'
import AppIcon from '@/design/AppIcon.vue'
import CategoryBadge from '@/design/CategoryBadge.vue'
import FieldRow from '@/design/FieldRow.vue'
import FormCard from '@/design/FormCard.vue'
import FormDivider from '@/design/FormDivider.vue'
import InlineMessage from '@/design/InlineMessage.vue'
import SheetView from '@/design/SheetView.vue'
import { catalogColors, defaultSymbolName, symbolNames } from '@/core/model/catalog'
import { categoryKinds, kindTitle, kindsTitle, type Category, type CategoryKind } from '@/core/model/ledger'
import { paletteVar, type PaletteColor } from '@/core/model/palette'
import { CategoryRules, categoryErrorText, type CategoryError } from '@/core/model/rules'
import { ledgerStore as store } from '@/core/store/ledgerStore'

const props = defineProps<{ kind?: CategoryKind; editing?: Category | null }>()
const emit = defineEmits<{ created: [Category]; close: [] }>()

const edited = computed(() => props.editing ?? null)

const name = ref(edited.value?.name ?? '')
const kinds = ref<CategoryKind[]>(edited.value ? [...edited.value.kinds] : [props.kind ?? 'expense'])
const symbolName = ref(edited.value?.symbolName ?? defaultSymbolName)
const color = ref<PaletteColor>(edited.value?.color ?? 'blue')
const error = ref<CategoryError | null>(null)
const isSaving = ref(false)
const isTyping = ref(false)

const title = computed(() => (edited.value ? 'Категория' : 'Новая категория'))
const submitTitle = computed(() => (edited.value ? 'Сохранить' : 'Создать'))

const existingNames = computed(() => kinds.value.flatMap((kind) => store.categoryNames(kind, edited.value?.id ?? null)))

const hasChanges = computed(() => {
  const current = edited.value
  if (!current) return true

  const sameKinds =
    kinds.value.length === current.kinds.length && kinds.value.every((kind) => current.kinds.includes(kind))

  return (
    name.value.trim() !== current.name ||
    !sameKinds ||
    symbolName.value !== current.symbolName ||
    color.value !== current.color
  )
})

function toggleKind(kind: CategoryKind): void {
  kinds.value = kinds.value.includes(kind)
    ? kinds.value.filter((item) => item !== kind)
    : [...kinds.value, kind]
  error.value = null
}

async function submit(): Promise<void> {
  isTyping.value = false

  const failure = CategoryRules.validate(name.value, kinds.value, existingNames.value)
  if (failure) {
    error.value = failure
    return
  }

  isSaving.value = true

  const current = edited.value
  if (current) {
    const updated = await store.updateCategory(current.id, name.value, kinds.value, symbolName.value, color.value)
    isSaving.value = false
    if (updated) emit('close')
    return
  }

  const created = await store.createCategory(name.value, kinds.value, symbolName.value, color.value)
  isSaving.value = false
  if (created) emit('created', created)
}
</script>

<template>
  <SheetView :open="true" :title="title" @close="emit('close')">
    <div class="form">
      <div class="form__preview">
        <CategoryBadge :symbol="symbolName" :color="color" :size="72" />

        <div class="form__preview-text">
          <p class="text-headline" :class="{ secondary: name.length === 0 }">
            {{ name.length === 0 ? 'Без названия' : name }}
          </p>
          <p class="text-footnote secondary">
            {{ kinds.length === 0 ? 'Тип не выбран' : kindsTitle(kinds) }}
          </p>
        </div>
      </div>

      <FormCard title="Категория">
        <FieldRow symbol="textformat" :is-active="isTyping">
          <input
            v-model="name"
            class="form__input"
            type="text"
            placeholder="Например, Продукты"
            @focus="isTyping = true"
            @blur="isTyping = false"
            @input="error = null"
          />
        </FieldRow>

        <FormDivider />

        <FieldRow symbol="arrow.up.arrow.down">
          <span class="form__kinds">
            <button
              v-for="kind in categoryKinds"
              :key="kind"
              type="button"
              class="form__kind"
              :class="{ 'form__kind--on': kinds.includes(kind) }"
              :aria-pressed="kinds.includes(kind)"
              @click="toggleKind(kind)"
            >
              <AppIcon :name="kinds.includes(kind) ? 'checkmark.circle.fill' : 'circle.dashed'" :size="16" />
              {{ kindTitle(kind) }}
            </button>
          </span>
        </FieldRow>
      </FormCard>

      <FormCard title="Иконка">
        <div class="form__grid">
          <button
            v-for="symbol in symbolNames"
            :key="symbol"
            type="button"
            class="form__symbol"
            :class="{ 'form__symbol--on': symbol === symbolName }"
            :style="symbol === symbolName ? { background: paletteVar(color), color: '#fff' } : undefined"
            :aria-label="symbol"
            :aria-pressed="symbol === symbolName"
            @click="symbolName = symbol"
          >
            <AppIcon :name="symbol" :size="20" />
          </button>
        </div>
      </FormCard>

      <FormCard title="Цвет">
        <div class="form__grid form__grid--colors">
          <button
            v-for="item in catalogColors"
            :key="item"
            type="button"
            class="form__color"
            :style="{ background: paletteVar(item) }"
            :aria-label="item"
            :aria-pressed="item === color"
            @click="color = item"
          >
            <AppIcon v-if="item === color" name="checkmark" :size="14" />
          </button>
        </div>
      </FormCard>

      <div class="form__notes">
        <InlineMessage v-if="error" kind="error" :text="categoryErrorText(error)" />
        <InlineMessage
          kind="info"
          text="Отметьте оба типа, если категория нужна и в расходах, и в доходах — например «Подарки»."
        />
        <InlineMessage
          v-if="edited"
          kind="info"
          text="Записанные операции останутся в этой категории и покажут новое название."
        />
      </div>
    </div>

    <template #bottom>
      <AppButton full-width :disabled="isSaving || !hasChanges" @click="submit">{{ submitTitle }}</AppButton>
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

.form__preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-m);
}

.form__preview-text {
  text-align: center;
}

.form__preview-text p {
  margin: 0 0 var(--space-xs);
}

.form__input {
  width: 100%;
  border: none;
  background: none;
  outline: none;
  font-size: 17px;
}

.form__kinds {
  display: flex;
  gap: var(--space-s);
}

.form__kind {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-s) var(--space-m);
  border-radius: var(--radius-capsule);
  background: var(--fill-quaternary);
  color: var(--label-secondary);
  font-size: 15px;
}

.form__kind--on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.form__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: var(--space-m);
  padding: var(--space-l);
}

.form__grid--colors {
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
}

.form__symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  border-radius: var(--radius-icon);
  background: var(--fill-tertiary);
}

.form__color {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 0 auto;
  border-radius: 50%;
  color: #fff;
}

.form__notes {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
</style>
