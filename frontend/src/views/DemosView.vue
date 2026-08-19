<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary, TagKeyInfo } from '../api/types'
import DemoCard from '../components/DemoCard.vue'

const demos = ref<DemoSummary[]>([])
const tagKeys = ref<TagKeyInfo[]>([])
const selectedTags = ref<string[]>([])
const q = ref('')
const sort = ref<'newest' | 'popular'>('newest')
const page = ref(1)
const pageSize = 12
const total = ref(0)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const hasMore = ref(true)

// 筛选 chips = 所有标签键下的值（author 键不在 tag_keys 中，自动排除）
const filterChips = computed(() =>
  tagKeys.value.flatMap((k) =>
    k.values.map((v) => ({ key: k.key, value: v.value, count: v.demo_count, mode: k.mode })),
  ),
)

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

async function load(reset = false) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const p = reset ? 1 : page.value
    const res = await api.listDemos({
      status: 'approved',
      tags: selectedTags.value,
      q: q.value.trim() || undefined,
      sort: sort.value,
      page: p,
      page_size: pageSize,
    })
    demos.value = reset ? res.items : [...demos.value, ...res.items]
    total.value = res.total
    page.value = p + 1
    hasMore.value = demos.value.length < res.total
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function reset() {
  page.value = 1
  hasMore.value = true
  // 保留旧列表直到新数据返回后再整体替换，避免高度塌陷/滚动跳顶
  void load(true)
}

function toggleTag(t: string) {
  const i = selectedTags.value.indexOf(t)
  if (i >= 0) selectedTags.value.splice(i, 1)
  else selectedTags.value.push(t)
  reset()
}

function applySort() {
  reset()
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
function onSearch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(reset, 300)
}

onMounted(async () => {
  try {
    tagKeys.value = await api.listTagKeys()
  } catch {
    tagKeys.value = []
  }
  await load(true)
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore.value && !loadingMore.value) {
        loadingMore.value = true
        void load().finally(() => (loadingMore.value = false))
      }
    },
    { rootMargin: '300px' },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">作品库</span>
    <h1 class="huge">作品库</h1>
    <p class="sub">搜索、筛选、浏览全部 AI 网页 Demo —— 支持按标签与热度检索。</p>
    <span class="mini-stat" style="margin-top: 14px"><b>{{ total }}</b> 件作品</span>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="toolbar">
      <div class="search-box">
        <input v-model="q" class="input" type="search" placeholder="搜索标题 / 描述 / 标签…" @input="onSearch" />
        <span class="search-icon">Q</span>
      </div>
      <div class="tabs" style="margin: 0">
        <button class="tab" :class="{ active: sort === 'newest' }" type="button" @click="sort = 'newest'; applySort()">最新</button>
        <button class="tab" :class="{ active: sort === 'popular' }" type="button" @click="sort = 'popular'; applySort()">最热</button>
      </div>
    </div>

    <div v-if="filterChips.length" class="filter-row">
      <button
        v-for="g in filterChips"
        :key="g.key + ':' + g.value"
        class="tag-chip"
        :class="['mode-' + g.mode, { active: selectedTags.includes(g.key + ':' + g.value) }]"
        type="button"
        @click="toggleTag(g.key + ':' + g.value)"
      >
        {{ g.key }}:{{ g.value }}
        <span class="count">{{ g.count }}</span>
      </button>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>

    <div v-if="loading && !demos.length" class="loading-row">
      <span class="spinner"></span> 加载 Demo 中…
    </div>

    <div v-else-if="!demos.length" class="empty-box">
      没有匹配的 Demo —— 换一组标签或关键词试试。
    </div>

    <div v-else class="waterfall">
      <div v-for="d in demos" :key="d.slug" class="waterfall-item">
        <DemoCard :demo="d" />
      </div>
    </div>

    <div ref="sentinel" class="loading-row">
      <template v-if="loadingMore"><span class="spinner"></span> 加载更多…</template>
      <template v-else-if="!hasMore">已加载全部 {{ total }} 个 Demo</template>
    </div>
  </section>
</template>
