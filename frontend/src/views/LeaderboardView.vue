<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary } from '../api/types'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'

const sorts = [
  { key: 'avg', label: '平均分' },
  { key: 'god', label: '神作榜' },
  { key: 'ghost', label: '鬼作榜' },
  { key: 'net', label: '净口碑' },
  { key: 'count', label: '评分人数' },
  { key: 'heat', label: '综合热度' },
] as const

const ranges = [
  { key: 'all', label: '全部' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
] as const

const sort = ref<'avg' | 'god' | 'ghost' | 'net' | 'count' | 'heat'>('avg')
const range = ref<'all' | 'week' | 'month'>('all')
const items = ref<DemoSummary[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.getLeaderboard(sort.value, page.value, pageSize, range.value)
    items.value = res.items
    total.value = res.total
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function changeSort(s: typeof sort.value) {
  if (sort.value === s) return
  sort.value = s
  page.value = 1
  load()
}

function changeRange(r: typeof range.value) {
  if (range.value === r) return
  range.value = r
  page.value = 1
  load()
}

onMounted(load)
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">排行榜</span>
    <h1 class="huge">神鬼榜</h1>
    <p class="sub">用「神作 / 鬼作」两极语义给作品投票，看看大家的口碑。</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="filter-row" style="margin-bottom: 8px">
      <button v-for="s in sorts" :key="s.key" class="tab" :class="{ active: sort === s.key }" type="button" @click="changeSort(s.key)">
        {{ s.label }}
      </button>
    </div>
    <div class="filter-row" style="margin-bottom: 16px">
      <span class="filter-label">范围</span>
      <button v-for="r in ranges" :key="r.key" class="tag-chip" :class="{ active: range === r.key }" type="button" @click="changeRange(r.key)">
        {{ r.label }}
      </button>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <div v-if="loading && !items.length" class="loading-row"><span class="spinner"></span> 加载榜单…</div>
    <div v-else-if="!items.length" class="empty-box">暂无上榜作品</div>

    <MasonryGrid v-else :items="items" :item-key="(d: unknown) => (d as DemoSummary).slug">
      <template #default="{ item }">
        <DemoCard :demo="item as DemoSummary" />
      </template>
    </MasonryGrid>

    <div v-if="items.length" class="filter-row" style="justify-content: center; margin-top: 16px">
      <button class="btn btn-sm btn-outline" type="button" :disabled="page <= 1" @click="page--; load()">上一页</button>
      <span class="muted">第 {{ page }} 页 / {{ total }}</span>
      <button class="btn btn-sm btn-outline" type="button" :disabled="page * pageSize >= total" @click="page++; load()">下一页</button>
    </div>
  </section>
</template>
