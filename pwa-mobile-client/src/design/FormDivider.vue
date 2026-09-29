<script setup lang="ts">
withDefaults(defineProps<{ inset?: number }>(), { inset: 56 })
</script>

<template>
  <div class="divider" :style="{ paddingLeft: `${inset}px` }">
    <div class="divider__line" />
  </div>
</template>

<style scoped>
.divider {
  background: var(--field-background);
}

.divider__line {
  height: 1px;
  background: var(--separator);
  opacity: 0.5;
}
</style>
