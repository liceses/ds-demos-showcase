<script setup lang="ts">
defineOptions({ name: 'AdminReviewSection' })
import { onMounted, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { DemoDetail } from '../../api/types'

const ui = useUiStore()
const pending = ref<DemoDetail[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    pending.value = await api.adminReview()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

async function review(slug: string, action: 'approve' | 'reject') {
  const idx = pending.value.findIndex((d) => d.slug === slug)
  const item = idx >= 0 ? pending.value[idx] : null
  if (item) pending.value.splice(idx, 1)
  try {
    await api.adminApprove(slug, action)
    ui.toast(action === 'approve' ? '已通过' : '已拒绝', 'success')
  } catch (e) {
    if (item) pending.value.splice(idx, 0, item)
    ui.toast((e as Error).message, 'error')
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载待审…</div>
    <div v-else-if="!pending.length" class="empty-box">没有待审核的 Demo</div>
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
        <button class="btn btn-sm btn-primary" type="button" @click="review(d.slug, 'approve')">通过</button>
        <button class="btn btn-sm btn-dark" type="button" @click="review(d.slug, 'reject')">拒绝</button>
        <RouterLink class="btn btn-sm btn-outline" :to="`/demo/${d.slug}`">预览</RouterLink>
      </div>
    </div>
  </div>
</template>
