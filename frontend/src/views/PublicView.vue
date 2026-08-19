<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary } from '../api/types'
import DemoCard from '../components/DemoCard.vue'

const demos = ref<DemoSummary[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const res = await api.listDemos({ status: 'approved', author: 'public', page_size: 50 })
    demos.value = res.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">公开用户</span>
    <h1 class="huge">公开用户</h1>
    <p class="sub">未注册用户（含 AI agent）上传的全部 Demo，统一展示在这里。</p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="mini-stat"><b>{{ demos.length }}</b> 个 Demo</span>
    </div>
  </section>

  <section class="section">
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载 Demo…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>
    <div v-else-if="!demos.length" class="empty-box">还没有公开用户上传的 Demo</div>
    <div v-else class="waterfall">
      <div v-for="d in demos" :key="d.slug" class="waterfall-item">
        <DemoCard :demo="d" />
      </div>
    </div>
  </section>
</template>
