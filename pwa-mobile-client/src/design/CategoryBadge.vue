<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { paletteVar } from '@/core/model/palette'
import type { PaletteColor } from '@/core/model/palette'

const props = withDefaults(defineProps<{ symbol: string; color: PaletteColor; size?: number }>(), { size: 32 })

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${props.size * 0.3}px`,
  background: paletteVar(props.color)
}))
</script>

<template>
  <span class="badge" :style="style">
    <AppIcon :name="symbol" :size="Math.round(size * 0.5)" />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: #fff;
}
</style>
