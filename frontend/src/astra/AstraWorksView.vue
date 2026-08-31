<script setup lang="ts">
// astra 首页：hero + 灰测叙事条 + 均匀网格画廊（封面即作品，无筛选无标签栏）。
// 数据面 = 后端按 Host 自动收敛的 astra 策展池，前端零过滤逻辑。
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary, SiteInfo } from '../api/types'
import { fmtAgo } from './format'

const PAGE = 24
const items = ref<DemoSummary[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const info = ref<SiteInfo | null>(null)

async function load(next: number) {
  loading.value = true
  try {
    const res = await api.listDemos({ page: next, page_size: PAGE })
    items.value = next === 1 ? res.items : [...items.value, ...res.items]
    total.value = res.total
    page.value = next
  } catch {
    // 后端未就绪/网络抖动：保持已有内容，空态由模板兜底
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load(1)
  api.getSiteInfo().then((d) => (info.value = d)).catch(() => undefined)
})
</script>

<template>
  <section class="ax-hero">
    <h1>works by<br /><span class="ax-dim">astra-canary.</span></h1>
    <p>A frontier model in private grey test. This is a live collection of its outputs — no demos promised, just demos shipped.</p>
    <div class="ax-meta-strip">
      <span><span class="ax-meta-blink"></span>cohort active</span>
      <span>works <b>{{ info?.content.demos_total ?? total }}</b></span>
      <span>added this week <b>{{ info?.content.uploads_last_7d ?? 0 }}</b></span>
      <span v-if="info?.hot.latest_demo">last refresh {{ fmtAgo(info.hot.latest_demo.created_at) }}</span>
    </div>
  </section>

  <div class="ax-section-head">
    <span>selected outputs</span>
    <span>{{ total }} shown</span>
  </div>

  <div v-if="loading && !items.length" class="ax-loading">assembling cohort…</div>
  <div v-else-if="!items.length" class="ax-empty">the cohort is still being assembled.</div>

  <div v-else class="ax-grid">
    <RouterLink v-for="d in items" :key="d.slug" class="ax-card" :to="`/demo/${d.slug}`">
      <figure>
        <img :src="d.cover_url" :alt="d.title" loading="lazy" />
      </figure>
      <figcaption>
        <span class="ax-card-title">{{ d.title }}</span>
        <span class="ax-card-date">{{ fmtAgo(d.created_at) }}</span>
      </figcaption>
    </RouterLink>
  </div>

  <button v-if="items.length < total" class="ax-load-more" :disabled="loading" @click="load(page + 1)">
    {{ loading ? 'loading…' : 'load more' }}
  </button>
</template>
