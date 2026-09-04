<script setup lang="ts">
defineOptions({ name: 'DemosView' })
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import type { DemoSummary, TagKeyInfo } from '../api/types'
import { tagLabel, tagStrLabel } from '../utils/funMode'
import { t, keyLabel, vendorLabel } from '../i18n'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'
import PromptDemoCard from '../components/PromptDemoCard.vue'
import RangeSlider from '../components/RangeSlider.vue'
import TagTip from '../components/TagTip.vue'

const demos = ref<DemoSummary[]>([])
const tagKeys = ref<TagKeyInfo[]>([])
const selectedTags = ref<string[]>([])
const q = ref('')
// v2：模型实体过滤（?model=slug，来自模型页「查看全部」）
const modelFilter = ref('')
const submittedQ = ref('')
const sort = ref<'newest' | 'popular' | 'random'>('newest')
const cardMode = ref<'normal' | 'prompt'>(localStorage.getItem('ds_card_mode') === 'prompt' ? 'prompt' : 'normal')
const stripsOpen = ref(false)
const route = useRoute()
const router = useRouter()

// 状态同步到 URL query（搜索/标签/排序可分享、可刷新还原）
function syncQuery() {
  const query: Record<string, string> = {}
  if (submittedQ.value) query.q = submittedQ.value
  if (selectedTags.value.length) query.tag = selectedTags.value.join(',')
  if (modelFilter.value) query.model = modelFilter.value
  if (sort.value !== 'newest') query.sort = sort.value
  router.replace({ query })
}

function setCardMode(m: 'normal' | 'prompt') {
  if (cardMode.value === m) return
  cardMode.value = m
  localStorage.setItem('ds_card_mode', m)
  reset()
}
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
  min?: number | null
  max?: number | null
  values: { value: string; count: number; description?: string }[]
}

// 分组筛选（A）：按标签键分行，组内 values 按热度排序
const filterGroups = computed<FilterGroup[]>(() =>
  [...tagKeys.value]
    .filter((k) => k.values.some((v) => v.demo_count > 0))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.key.localeCompare(b.key))
    .map((k) => ({
      key: k.key,
      mode: k.mode,
      label: k.label || k.key,
      total: k.values.reduce((n, v) => n + v.demo_count, 0),
      min: k.min,
      max: k.max,
      values: [...k.values]
        .filter((v) => v.demo_count > 0)
        .sort((a, b) => b.demo_count - a.demo_count)
        .map((v) => ({ value: v.value, count: v.demo_count, description: v.description })),
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
  // 默认全部折叠（含 model）
  return groupExpanded.value[k.key] ?? false
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

// model 厂商分组（与上传页一致）
const VENDOR_PREFIX: [string, string][] = [
  ['dsv', 'DeepSeek'],
  ['deepseek', 'DeepSeek'],
  ['gpt', 'OpenAI'],
  ['o1', 'OpenAI'],
  ['o3', 'OpenAI'],
  ['claude', 'Anthropic'],
  ['gemini', 'Google'],
  ['qwen', '阿里'],
  ['doubao', '字节'],
]
function guessVendor(value: string): string {
  const v = value.toLowerCase()
  for (const [prefix, name] of VENDOR_PREFIX) {
    if (v.startsWith(prefix)) return name
  }
  return '其他'
}
function vendorGroupsOf(k: FilterGroup) {
  const map = new Map<string, { value: string; count: number; description?: string }[]>()
  for (const v of k.values) {
    const g = guessVendor(v.value)
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(v)
  }
  return [...map.entries()].map(([group, values]) => ({ group, values }))
}
const vendorExpanded = ref<Record<string, boolean>>({})
function isVendorCollapsed(group: string) {
  return vendorExpanded.value[group] === true
}
function toggleVendor(group: string) {
  vendorExpanded.value = { ...vendorExpanded.value, [group]: !isVendorCollapsed(group) }
}
const VENDOR_DOT: Record<string, string> = {
  DeepSeek: 'var(--teal)',
  OpenAI: 'var(--ink)',
  Anthropic: 'var(--red)',
  Google: 'var(--mint)',
  阿里: 'var(--yellow)',
  字节: 'var(--paper)',
  其他: '#999',
}

// int 键范围筛选：双滑块 → key:lo-hi 加入 selectedTags（后端已支持范围解析）
const intRange = ref<Record<string, { lo: number; hi: number }>>({})

function activeRangeOf(k: FilterGroup) {
  return selectedTags.value.find((t) => t.startsWith(k.key + ':')) || ''
}

function applyIntRange(k: FilterGroup) {
  const r = intRange.value[k.key] || { lo: k.min ?? 0, hi: k.max ?? 999 }
  const keyPrefix = k.key + ':'
  selectedTags.value = selectedTags.value.filter((t) => !t.startsWith(keyPrefix))
  if (r.lo <= r.hi) {
    selectedTags.value.push(`${k.key}:${r.lo}-${r.hi}`)
  }
  reset()
  syncQuery()
}

function clearIntRange(k: FilterGroup) {
  intRange.value = { ...intRange.value, [k.key]: { lo: k.min ?? 0, hi: k.max ?? 999 } }
  selectedTags.value = selectedTags.value.filter((t) => !t.startsWith(k.key + ':'))
  reset()
  syncQuery()
}

function clearTags() {
  selectedTags.value = []
  reset()
  syncQuery()
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
      q: submittedQ.value || undefined,
      model: modelFilter.value || undefined,
      sort: cardMode.value === 'prompt' ? 'prompt' : sort.value,
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
  // 立即清空，显示明确加载态；不回顶，避免点击按钮时滚动条跳动
  demos.value = []
  error.value = ''
  page.value = 1
  hasMore.value = true
  void load(true)
}

function toggleTag(t: string) {
  const i = selectedTags.value.indexOf(t)
  if (i >= 0) selectedTags.value.splice(i, 1)
  else selectedTags.value.push(t)
  reset()
  syncQuery()
}

function applySort() {
  reset()
  syncQuery()
}

// 显式提交搜索：只有回车 / 点「搜索」才触发请求
function submitSearch() {
  const next = q.value.trim()
  if (next === submittedQ.value) {
    // 没有新词：空提交等同清除搜索；否则什么都不做
    if (!next && submittedQ.value) {
      submittedQ.value = ''
      reset()
    }
    return
  }
  submittedQ.value = next
  reset()
  syncQuery()
}

function clearSearch() {
  q.value = ''
  if (submittedQ.value) {
    submittedQ.value = ''
    reset()
    syncQuery()
  }
}

/** 从 URL query 还原筛选状态；返回"是否真的变了"。
 *  必须幂等：本页自己也会写 query（第 34 行），监听器不能把自家写入再当成一次新导航。 */
function applyRouteQuery(): boolean {
  const qq = typeof route.query.q === 'string' ? route.query.q : ''
  const tagQ = typeof route.query.tag === 'string' ? route.query.tag : ''
  const modelQ = typeof route.query.model === 'string' ? route.query.model : ''
  const sortQ = route.query.sort === 'popular' || route.query.sort === 'random' ? (route.query.sort as 'popular' | 'random') : sort.value
  const nextTags = tagQ ? tagQ.split(',').filter(Boolean) : selectedTags.value
  const changed =
    qq !== submittedQ.value ||
    modelQ !== modelFilter.value ||
    sortQ !== sort.value ||
    nextTags.join(',') !== selectedTags.value.join(',')
  if (!changed) return false
  if (qq) {
    q.value = qq
    submittedQ.value = qq
  }
  if (tagQ) selectedTags.value = nextTags
  modelFilter.value = modelQ
  sort.value = sortQ
  return true
}

onMounted(async () => {
  // 从 URL query 还原状态
  applyRouteQuery()
  try {
    tagKeys.value = await api.listTagKeys()
  } catch {
    tagKeys.value = []
  }
  for (const k of tagKeys.value) {
    if (k.mode === 'int' && !intRange.value[k.key]) intRange.value[k.key] = { lo: k.min ?? 0, hi: k.max ?? 999 }
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

// pageKey 不再包含 query（同路径换筛选不重挂），所以外部链接跳来本页时靠这里同步
watch(
  () => [route.query.q, route.query.tag, route.query.model, route.query.sort].join('|'),
  () => {
    if (applyRouteQuery()) reset()
  },
)

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="route-page">  <section class="page-hero">
    <span class="eyebrow">{{ t('app.nav.demos', '作品库') }}</span>
    <h1 class="huge">{{ t('app.nav.demos', '作品库') }}</h1>
    <p class="sub">{{ t('demos.sub', '搜索、筛选、浏览全部 AI 网页 Demo —— 支持按标签与热度检索。') }}</p>
    <span class="mini-stat" style="margin-top: 14px"><b>{{ total }}</b> {{ t('demos.works', '件作品') }}</span>
  </section>

  <section class="section" style="padding-top: 8px">
    <!-- 视图栏：模式轨道 + 排序，独立一行，不与搜索/标签混排 -->
    <div class="view-bar">
      <div class="mode-tool">
        <span class="mode-rail-stamp">{{ t('demos.mode', '模式') }}</span>
        <div class="mode-rail" :class="{ prompt: cardMode === 'prompt' }" role="group" aria-label="卡片模式">
          <button class="mode-rail-item" type="button" @click="setCardMode('normal')">{{ t('demos.normal', '常规') }}</button>
          <button class="mode-rail-item" type="button" @click="setCardMode('prompt')">{{ t('demos.prompt', '提示词') }}</button>
          <span class="mode-rail-knob" :class="{ prompt: cardMode === 'prompt' }">
            {{ cardMode === 'prompt' ? t('demos.prompt', '提示词') : t('demos.normal', '常规') }}
          </span>
        </div>
        <span v-if="cardMode === 'prompt'" class="mode-rail-badge">PROMPT</span>
      </div>

      <div v-if="cardMode === 'normal'" class="tabs" style="margin: 0">
        <button class="tab" :class="{ active: sort === 'newest' }" type="button" @click="sort = 'newest'; applySort()">{{ t('demos.newest', '最新') }}</button>
        <button class="tab" :class="{ active: sort === 'popular' }" type="button" @click="sort = 'popular'; applySort()">{{ t('demos.hot', '最热') }}</button>
        <button class="tab" :class="{ active: sort === 'random' }" type="button" @click="sort = 'random'; applySort()">{{ t('demos.random', '随机') }}</button>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-box" style="flex: 1">
        <input
          v-model="q"
          class="input"
          type="search"
          :placeholder="t('demos.searchPlaceholder', '搜索标题 / 描述 / 标签…（回车提交）')"
          @keyup.enter="submitSearch"
        />
        <button class="btn btn-secondary search-submit" type="button" @click="submitSearch">{{ t('demos.search', '搜索') }}</button>
      </div>
    </div>

    <!-- 已应用搜索词 -->
    <div v-if="submittedQ" class="filter-row tag-selected-row">
      <span class="filter-label">{{ t('demos.search', '搜索') }}</span>
      <button class="tag-chip active" type="button" title="点击移除搜索" @click="clearSearch">
        {{ submittedQ }}<span class="chip-x">X</span>
      </button>
    </div>

    <!-- 已选标签：置顶、可单独/一键移除 -->
    <div v-if="selectedTags.length" class="filter-row tag-selected-row">
      <span class="filter-label">{{ t('demos.selected', '已选') }}</span>
      <button
        v-for="t in selectedTags"
        :key="t"
        class="tag-chip active"
        type="button"
        @click="toggleTag(t)"
      >
        {{ tagStrLabel(t) }}<span class="chip-x">X</span>
      </button>
      <button class="btn btn-sm btn-dark" type="button" @click="clearTags">{{ t('demos.clearTags', '清空') }}</button>
    </div>

    <!-- 热门快捷 -->
    <div v-if="hotChips.length" class="filter-row">
      <span class="filter-label">{{ t('demos.hotChips', '热门') }}</span>
      <button
        v-for="g in hotChips"
        :key="g.key + ':' + g.value"
        class="tag-chip"
        :class="['mode-' + g.mode, { active: selectedTags.includes(g.key + ':' + g.value) }]"
        type="button"
        @click="toggleTag(g.key + ':' + g.value)"
      >
        {{ keyLabel(g.key) }}:{{ tagLabel(g.value) }}
        <span class="count">{{ g.count }}</span>
      </button>
      <button class="btn btn-sm btn-outline" type="button" @click="stripsOpen = !stripsOpen">
        {{ stripsOpen ? t('demos.hideTags', '收起标签') : t('demos.allTags', '展开全部标签') }}
      </button>
    </div>

    <!-- 分组筛选（细条）：默认完全折叠，点「展开全部标签」才显示 -->
    <div v-if="stripsOpen && filterGroups.length" class="tag-strips">
      <div v-for="k in filterGroups" :key="k.key" class="tag-strip-row" :class="'mode-' + k.mode">
        <span class="tag-strip-title">
          {{ keyLabel(k.key, k.label) }} <code>{{ k.key }}</code>
          <span class="mode-dot" :class="'mode-dot-' + k.mode"></span>
        </span>
        <template v-if="k.mode === 'int'">
          <div class="filter-row tag-strip-chips int-range-row">
            <RangeSlider :min="k.min ?? 0" :max="k.max ?? 999" v-model="intRange[k.key]" />
            <button class="btn btn-sm btn-secondary" type="button" @click="applyIntRange(k)">{{ t('demos.apply', '应用') }}</button>
            <button v-if="activeRangeOf(k)" class="btn btn-sm btn-dark" type="button" @click="clearIntRange(k)">{{ t('demos.clearRange', '清除') }}</button>
            <span v-if="activeRangeOf(k)" class="tag-chip active">{{ activeRangeOf(k) }}</span>
          </div>
        </template>
        <template v-else>
          <!-- model：厂商分组 + 彩色点，默认收起 -->
          <template v-if="k.mode === 'fixed'">
            <div v-if="isCollapsed(k)" class="filter-row tag-strip-chips">
              <button class="tag-chip tag-strip-toggle" type="button" @click="toggleGroup(k)">{{ t('demos.modelsExpandN', '模型 · 展开 +{n}', { n: k.values.length }) }}</button>
            </div>
            <div v-else class="tag-strip-chips">
              <div v-for="g in vendorGroupsOf(k)" :key="g.group" class="vendor-strip">
                <span class="vendor-strip-head" role="button" @click="toggleVendor(g.group)">
                  <span class="vendor-dot" :style="{ background: VENDOR_DOT[g.group] || '#999' }"></span>
                  <span class="vendor-strip-name">{{ vendorLabel(g.group) }}</span>
                  <span class="vendor-strip-toggle">{{ isVendorCollapsed(g.group) ? t('demos.expand', '展开') : t('demos.collapse', '收起') }}</span>
                </span>
                <div v-if="!isVendorCollapsed(g.group)" class="filter-row" style="margin: 0">
                  <button
                    v-for="v in g.values"
                    :key="v.value"
                    class="tag-chip mode-fixed"
                    :class="{ active: selectedTags.includes(k.key + ':' + v.value) }"
                    type="button"
                    @click="toggleTag(k.key + ':' + v.value)"
                  >{{ tagLabel(v.value) }}<span class="count">{{ v.count }}</span><TagTip :tag-key="k.key" :value="v.value" :description="v.description" /></button>
                </div>
              </div>
              <button class="tag-chip tag-strip-toggle" type="button" @click="toggleGroup(k)">{{ t('demos.collapse', '收起') }}</button>
            </div>
          </template>
          <div v-else class="filter-row tag-strip-chips">
            <button
              v-for="v in visibleValues(k)"
              :key="v.value"
              class="tag-chip"
              :class="['mode-' + k.mode, { active: selectedTags.includes(k.key + ':' + v.value) }]"
              type="button"
              @click="toggleTag(k.key + ':' + v.value)"
            >
              {{ tagLabel(v.value) }}
              <span class="count">{{ v.count }}</span>
              <TagTip :tag-key="k.key" :value="v.value" :description="v.description" />
            </button>
            <button
              v-if="isCollapsed(k) && k.values.length > COLLAPSED_SHOW"
              class="tag-chip tag-strip-toggle"
              type="button"
              @click="toggleGroup(k)"
            >
              {{ t('demos.expandN', '展开 +{n}', { n: hiddenCount(k) }) }}
            </button>
            <button
              v-if="!isCollapsed(k)"
              class="tag-chip tag-strip-toggle"
              type="button"
              @click="toggleGroup(k)"
            >
              {{ t('demos.collapse', '收起') }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>

    <div v-if="loading && !demos.length" class="loading-row">
      <span class="spinner"></span> {{ refreshing ? t('demos.refreshing', '正在刷新…') : t('demos.loading', '加载 Demo 中…') }}
    </div>

    <div v-else-if="!demos.length" class="empty-box">
      {{ t('demos.noMatch', '没有匹配的 Demo —— 换一组标签或关键词试试。') }}
    </div>

    <MasonryGrid v-else :items="demos" :item-key="(d: unknown) => (d as DemoSummary).slug">
      <template #default="{ item }">
        <PromptDemoCard v-if="cardMode === 'prompt'" :demo="item as DemoSummary" />
        <DemoCard v-else :demo="item as DemoSummary" />
      </template>
    </MasonryGrid>

    <div ref="sentinel" class="loading-row">
      <template v-if="loadingMore"><span class="spinner"></span> {{ t('demos.loadMore', '加载更多…') }}</template>
      <template v-else-if="!hasMore">{{ t('demos.allLoaded', '已加载全部 {n} 个 Demo', { n: total }) }}</template>
    </div>
  </section>
  </div>
</template>
