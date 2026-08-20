<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api'
import type { DemoSummary, TagKeyInfo } from '../api/types'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'

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
const refreshing = ref(false)
const error = ref('')
const hasMore = ref(true)

type FilterGroup = {
  key: string
  mode: 'fixed' | 'open' | 'int'
  label: string
  total: number
  values: { value: string; count: number }[]
}

// 分组筛选（A）：按标签键分行，组内 values 按热度排序
const filterGroups = computed<FilterGroup[]>(() =>
  [...tagKeys.value]
    .filter((k) => k.values.length > 0)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.key.localeCompare(b.key))
    .map((k) => ({
      key: k.key,
      mode: k.mode,
      label: k.label || k.key,
      total: k.values.reduce((n, v) => n + v.demo_count, 0),
      values: [...k.values].sort((a, b) => b.demo_count - a.demo_count).map((v) => ({ value: v.value, count: v.demo_count })),
    })),
)

// 热门快捷（B）：全站计数最高的 6 个标签值
const hotChips = computed(() =>
  tagKeys.value
    .flatMap((k) => k.values.map((v) => ({ key: k.key, value: v.value, count: v.demo_count, mode: k.mode })))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6),
)

// 折叠态：缺省全部折叠（细条只露前 4 个值），显式展开记录在 expanded
const COLLAPSED_SHOW = 4
const groupExpanded = ref<Record<string, boolean>>({})
function isExpanded(k: FilterGroup) {
  return !!groupExpanded.value[k.key]
}
function isCollapsed(k: FilterGroup) {
  return !isExpanded(k)
}
function toggleGroup(k: FilterGroup) {
  // 写入「与当前相反的展开态」：折叠→置 true 展开，展开→置 false 折叠
  groupExpanded.value = { ...groupExpanded.value, [k.key]: !isExpanded(k) }
}
function visibleValues(k: FilterGroup) {
  return isCollapsed(k) ? k.values.slice(0, COLLAPSED_SHOW) : k.values
}
function hiddenCount(k: FilterGroup) {
  return isCollapsed(k) ? Math.max(0, k.values.length - COLLAPSED_SHOW) : 0
}

function clearTags() {
  selectedTags.value = []
  reset()
}

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
    refreshing.value = false
  }
}

function reset() {
  if (loading.value) return
  refreshing.value = true
  // 立即清空并回顶，显示明确加载态；避免「旧卡留着→数据返回后一次性整体替换」的突然消失/出现
  demos.value = []
  error.value = ''
  page.value = 1
  hasMore.value = true
  window.scrollTo({ top: 0, behavior: 'auto' })
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
      // reset/首载进行中、或没有更多时，不触发翻页（避免列表塌陷后 sentinel 进视口误翻页）
      if (!entries[0].isIntersecting) return
      if (loading.value || loadingMore.value || refreshing.value || !hasMore.value) return
      loadingMore.value = true
      void load().finally(() => (loadingMore.value = false))
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

    <!-- 已选标签：置顶、可单独/一键移除 -->
    <div v-if="selectedTags.length" class="filter-row tag-selected-row">
      <span class="filter-label">已选</span>
      <button
        v-for="t in selectedTags"
        :key="t"
        class="tag-chip active"
        type="button"
        @click="toggleTag(t)"
      >
        {{ t }}<span class="chip-x">X</span>
      </button>
      <button class="btn btn-sm btn-dark" type="button" @click="clearTags">清空</button>
    </div>

    <!-- 热门快捷 -->
    <div v-if="hotChips.length" class="filter-row">
      <span class="filter-label">热门</span>
      <button
        v-for="g in hotChips"
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

    <!-- 分组筛选（细条）：每键一行、默认折叠只露前 4 个，点「展开」看全部 -->
    <div v-if="filterGroups.length" class="tag-strips">
      <div v-for="k in filterGroups" :key="k.key" class="tag-strip-row" :class="'mode-' + k.mode">
        <span class="tag-strip-title">
          {{ k.label }} <code>{{ k.key }}</code>
          <span class="mode-dot" :class="'mode-dot-' + k.mode"></span>
        </span>
        <div class="filter-row tag-strip-chips">
          <button
            v-for="v in visibleValues(k)"
            :key="v.value"
            class="tag-chip"
            :class="['mode-' + k.mode, { active: selectedTags.includes(k.key + ':' + v.value) }]"
            type="button"
            @click="toggleTag(k.key + ':' + v.value)"
          >
            {{ v.value }}
            <span class="count">{{ v.count }}</span>
          </button>
          <button
            v-if="isCollapsed(k) && k.values.length > COLLAPSED_SHOW"
            class="tag-chip tag-strip-toggle"
            type="button"
            @click="toggleGroup(k)"
          >
            展开 +{{ hiddenCount(k) }}
          </button>
          <button
            v-if="!isCollapsed(k)"
            class="tag-chip tag-strip-toggle"
            type="button"
            @click="toggleGroup(k)"
          >
            收起
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>

    <div v-if="loading && !demos.length" class="loading-row">
      <span class="spinner"></span> {{ refreshing ? '正在刷新…' : '加载 Demo 中…' }}
    </div>

    <div v-else-if="!demos.length" class="empty-box">
      没有匹配的 Demo —— 换一组标签或关键词试试。
    </div>

    <MasonryGrid v-else :items="demos" :item-key="(d: unknown) => (d as DemoSummary).slug">
      <template #default="{ item }">
        <DemoCard :demo="item as DemoSummary" />
      </template>
    </MasonryGrid>

    <div ref="sentinel" class="loading-row">
      <template v-if="loadingMore"><span class="spinner"></span> 加载更多…</template>
      <template v-else-if="!hasMore">已加载全部 {{ total }} 个 Demo</template>
    </div>
  </section>
</template>
