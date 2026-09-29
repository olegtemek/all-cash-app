<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <section class="card">
    <h2 v-if="title" class="card__title">{{ title }}</h2>
    <div class="card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.card__title {
  margin: 0;
  padding: 0 var(--space-l);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--label-secondary);
}

.card__body {
  background: var(--field-background);
  border-radius: var(--radius-card);
  overflow: hidden;
}
</style>
