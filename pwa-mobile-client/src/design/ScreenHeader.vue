<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <header class="header">
    <h1 class="header__title text-large-title">{{ title }}</h1>
    <div class="header__trailing">
      <slot name="trailing" />
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  padding: 20px var(--space-l) 14px;
}

.header__title {
  flex: 1 1 auto;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header__trailing {
  flex: 0 0 auto;
}
</style>
