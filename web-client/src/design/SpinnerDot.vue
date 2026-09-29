<template>
  <span class="dot" role="status" aria-label="Идёт загрузка" />
</template>

<style scoped>
.dot {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--fill-tertiary);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
