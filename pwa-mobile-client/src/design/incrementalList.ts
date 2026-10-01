import { computed, ref, watch, type Ref, type WatchSource } from 'vue'

export const incrementalPageSize = 40

export interface IncrementalList<T> {
  visible: Ref<T[]>
  hasMore: Ref<boolean>
  showMore: () => void
}

interface RowGroup<Row> {
  rows: Row[]
}

/**
 * Renders a long list in pages: only the first `pageSize` items are shown,
 * `showMore` reveals the next page. The limit resets when `resetOn` changes.
 */
export function useIncrementalList<T>(
  source: Ref<T[]>,
  options: { pageSize?: number; resetOn?: WatchSource } = {}
): IncrementalList<T> {
  const pageSize = options.pageSize ?? incrementalPageSize
  const limit = ref(pageSize)

  if (options.resetOn) watch(options.resetOn, () => (limit.value = pageSize))

  return {
    visible: computed(() => source.value.slice(0, limit.value)),
    hasMore: computed(() => source.value.length > limit.value),
    showMore: () => {
      limit.value += pageSize
    }
  }
}

/**
 * Same as `useIncrementalList`, but counts rows inside groups (e.g. operation days),
 * so one huge group does not get rendered whole and many small groups count by rows.
 */
export function useIncrementalGroups<Row, G extends RowGroup<Row>>(
  source: Ref<G[]>,
  options: { pageSize?: number; resetOn?: WatchSource } = {}
): IncrementalList<G> {
  const pageSize = options.pageSize ?? incrementalPageSize
  const limit = ref(pageSize)

  if (options.resetOn) watch(options.resetOn, () => (limit.value = pageSize))

  const visible = computed(() => {
    const groups: G[] = []
    let remaining = limit.value

    for (const group of source.value) {
      if (remaining <= 0) break
      groups.push(group.rows.length <= remaining ? group : { ...group, rows: group.rows.slice(0, remaining) })
      remaining -= group.rows.length
    }
    return groups
  })

  const hasMore = computed(() => {
    let total = 0
    for (const group of source.value) {
      total += group.rows.length
      if (total > limit.value) return true
    }
    return false
  })

  return {
    visible,
    hasMore,
    showMore: () => {
      limit.value += pageSize
    }
  }
}
