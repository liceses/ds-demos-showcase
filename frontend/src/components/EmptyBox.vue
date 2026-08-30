<script setup lang="ts">
import { t } from '../i18n'

defineProps<{ text?: string }>()
</script>

<template>
  <div class="empty-box">{{ text || t('common.empty', '暂无数据') }}</div>
</template>
