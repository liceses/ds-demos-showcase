<script setup lang="ts">
defineProps<{ text?: string }>()
</script>

<template>
  <div class="loading-row"><span class="spinner"></span> {{ text || '加载中…' }}</div>
</template>
