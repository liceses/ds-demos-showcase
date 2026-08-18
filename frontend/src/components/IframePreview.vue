<script setup lang="ts">
defineProps<{
  src?: string
  srcdoc?: string
  title?: string
}>()
</script>

<template>
  <iframe
    class="preview-frame"
    :src="src"
    :srcdoc="srcdoc"
    :title="title || 'Demo 预览'"
    sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"
    loading="eager"
  ></iframe>
</template>
