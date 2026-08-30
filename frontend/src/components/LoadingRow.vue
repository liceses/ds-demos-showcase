<script setup lang="ts">
import { t } from '../i18n'

defineProps<{ text?: string }>()
</script>

<template>
  <div class="loading-row"><span class="spinner"></span> {{ text || t('common.loading', '加载中…') }}</div>
</template>
