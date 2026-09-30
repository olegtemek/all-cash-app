<script setup lang="ts">
import { t } from '@/core/i18n'
import { computed, ref, watch } from 'vue'
import { paletteVar } from '@/core/model/palette'
import { shareTitle, spendingTotalTitle, type CategorySpending } from '@/core/model/analytics'

const props = defineProps<{ categories: CategorySpending[] }>()

const selectedID = ref<string | null>(null)

const size = 188
const center = size / 2
const outerRadius = center - 6
const innerRatio = 0.66

const leader = computed(() => props.categories[0] ?? null)

const highlighted = computed(() => {
  if (!selectedID.value) return leader.value
  return props.categories.find((item) => item.id === selectedID.value) ?? leader.value
})

interface Sector {
  id: string
  path: string
  color: string
  opacity: number
}

function sectorPath(start: number, end: number, outer: number, inner: number): string {
  const angle = (fraction: number) => fraction * 2 * Math.PI - Math.PI / 2
  const point = (fraction: number, radius: number) => [
    center + radius * Math.cos(angle(fraction)),
    center + radius * Math.sin(angle(fraction))
  ]

  const largeArc = end - start > 0.5 ? 1 : 0
  const [outerStartX, outerStartY] = point(start, outer)
  const [outerEndX, outerEndY] = point(end, outer)
  const [innerEndX, innerEndY] = point(end, inner)
  const [innerStartX, innerStartY] = point(start, inner)

  return [
    `M ${outerStartX} ${outerStartY}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${outerEndX} ${outerEndY}`,
    `L ${innerEndX} ${innerEndY}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${innerStartX} ${innerStartY}`,
    'Z'
  ].join(' ')
}

const sectors = computed<Sector[]>(() => {
  const total = props.categories.reduce((accumulated, item) => accumulated + item.share, 0)
  if (total <= 0) return []

  let cursor = 0
  return props.categories.map((item) => {
    const start = cursor
    const end = cursor + item.share / total
    cursor = end

    const isSelected = item.id === selectedID.value
    const outer = isSelected ? outerRadius : outerRadius * 0.96
    const inset = Math.min(0.004, (end - start) / 4)

    return {
      id: item.id,
      path: sectorPath(start + inset, end - inset, outer, outerRadius * innerRatio),
      color: paletteVar(item.color),
      opacity: selectedID.value === null || isSelected ? 1 : 0.35
    }
  })
})

function toggle(id: string): void {
  selectedID.value = selectedID.value === id ? null : id
}

watch(
  () => props.categories,
  () => {
    selectedID.value = null
  }
)

const accessibilityLabel = computed(() => {
  const leaders = props.categories
    .slice(0, 3)
    .map((item) => `${item.name} ${shareTitle(item.share)}`)
    .join(', ')
  return t('an.shares', { leaders })
})
</script>

<template>
  <div class="donut" :aria-label="accessibilityLabel" role="img">
    <svg :viewBox="`0 0 ${size} ${size}`" class="donut__chart">
      <path
        v-for="sector in sectors"
        :key="sector.id"
        :d="sector.path"
        :fill="sector.color"
        :opacity="sector.opacity"
        class="donut__sector"
        @click="toggle(sector.id)"
      />
    </svg>

    <div v-if="highlighted" class="donut__center">
      <p class="text-title3">{{ shareTitle(highlighted.share) }}</p>
      <p class="text-footnote secondary">{{ highlighted.name }}</p>
      <p v-if="selectedID" class="text-footnote secondary numeric">{{ spendingTotalTitle(highlighted) }}</p>
    </div>
  </div>
</template>

<style scoped>
.donut {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 188px;
}

.donut__chart {
  height: 100%;
  width: 188px;
}

.donut__sector {
  cursor: pointer;
  transition: opacity var(--duration-control) var(--ease-control);
}

.donut__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
  text-align: center;
  padding: 0 var(--space-xl);
}

.donut__center p {
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
