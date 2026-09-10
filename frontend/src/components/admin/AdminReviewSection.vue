<script setup lang="ts">
defineOptions({ name: 'AdminReviewSection' })
import { api } from '../../api'
import { useAdminLoader } from '../../composables/useAdminLoader'
import { useUiStore } from '../../stores/ui'
import LoadingRow from '../LoadingRow.vue'
import EmptyBox from '../EmptyBox.vue'
import type { DemoDetail } from '../../api/types'

const ui = useUiStore()

// RF-3：样板收进 useAdminLoader（失败出口保持 toast：待审列表失败一闪即过）
const { data: pending, loading } = useAdminLoader({
  fetcher: () => api.adminReview(),
  initial: [] as DemoDetail[],
  errorMode: 'toast',
})
async function review(slug: string, action: 'approve' | 'reject') {
  const idx = pending.value.findIndex((d) => d.slug === slug)
  const item = idx >= 0 ? pending.value[idx] : null
  if (item) pending.value.splice(idx, 1)
  try {
    await api.adminApprove(slug, action)
    ui.toast(action === 'approve' ? '已批准' : '已驳回', 'success')
  } catch (e) {
    if (item) pending.value.splice(idx, 0, item)
    ui.toast((e as Error).message, 'error')
  }
}
</script>

<template>
  <div>
    <LoadingRow v-if="loading" text="加载待审…" />
    <EmptyBox v-else-if="!pending.length" text="没有待审核的 Demo" />
    <div v-for="d in pending" :key="d.slug" class="card card-sunny" style="padding: 18px; margin-bottom: 18px">
      <div class="section-head" style="margin-bottom: 8px">
        <h2>{{ d.title }}</h2>
        <span class="status-pill status-pending">pending</span>
      </div>
      <p class="muted" style="margin-bottom: 12px">{{ d.description }}</p>
      <div class="filter-row" style="margin-bottom: 12px">
        <span v-for="t in d.tags" :key="t.key + ':' + t.value" class="tag-chip">{{ t.key }}:{{ t.value }}</span>
      </div>
      <div class="filter-row" style="margin-bottom: 0">
        <button class="btn btn-sm btn-primary" type="button" @click="review(d.slug, 'approve')">批准</button>
        <button class="btn btn-sm btn-dark" type="button" @click="review(d.slug, 'reject')">驳回</button>
        <RouterLink class="btn btn-sm btn-outline" :to="`/demo/${d.slug}`">预览</RouterLink>
      </div>
    </div>
  </div>
</template>
