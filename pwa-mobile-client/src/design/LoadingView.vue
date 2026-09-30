<script setup lang="ts">
import { t } from '@/core/i18n'
</script>

<template>
  <div class="loading" role="status" :aria-label="t('common.loading')">
    <span class="loading__spinner" />
  </div>
</template>

<style scoped>
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

.loading__spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--fill-tertiary);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
