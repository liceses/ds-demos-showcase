<script setup lang="ts">
defineProps<{ count?: number }>()
</script>

<template>
  <div class="skeleton-grid">
    <div v-for="i in (count ?? 3)" :key="i" class="skeleton-card">
      <div class="skeleton-block" style="height: 140px"></div>
      <div class="skeleton-line" style="width: 70%"></div>
      <div class="skeleton-line" style="width: 45%"></div>
    </div>
  </div>
</template>
