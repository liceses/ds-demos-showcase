<script setup lang="ts">
import MarkdownRenderer from './MarkdownRenderer.vue'
import type { Announcement } from '../api/types'

defineProps<{ ann: Announcement | null }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="ann" class="ann-modal">
      <div class="ann-modal-mask" @click="emit('close')"></div>
      <div class="ann-modal-panel">
        <div class="ann-modal-head">
          <div>
            <div class="filter-row" style="margin: 0 0 6px">
              <span v-if="ann.pinned" class="ann-pin">置顶</span>
              <span v-if="ann.category" class="ann-cat">{{ ann.category }}</span>
            </div>
            <h2 style="margin: 0">{{ ann.title }}</h2>
          </div>
          <button class="btn btn-sm btn-dark" type="button" @click="emit('close')">关闭</button>
        </div>
        <MarkdownRenderer :content="ann.content" />
        <div class="filter-row" style="margin-top: 14px">
          <RouterLink v-if="ann.topic_id" class="btn btn-sm btn-outline" :to="`/forum/topic/${ann.topic_id}`">去讨论 →</RouterLink>
          <span class="muted" style="font-size: 12px">{{ new Date(ann.created_at).toLocaleString('zh-CN') }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
