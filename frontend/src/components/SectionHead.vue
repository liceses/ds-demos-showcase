<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="section-head">
    <h2 class="section-title">{{ title }}</h2>
    <slot />
  </div>
</template>
