<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ page: number; total: number; pageSize: number }>()
const emit = defineEmits<{ change: [page: number] }>()

const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
</script>

<template>
  <div class="filter-row" style="justify-content: center; margin-top: 16px">
    <button class="btn btn-sm btn-outline" type="button" :disabled="page <= 1" @click="emit('change', page - 1)">上一页</button>
    <span class="tag-stat"><b>{{ page }}</b> / {{ pages }}</span>
    <button class="btn btn-sm btn-outline" type="button" :disabled="page >= pages" @click="emit('change', page + 1)">下一页</button>
  </div>
</template>
