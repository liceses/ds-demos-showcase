<script setup lang="ts">
defineOptions({ name: 'DemosView' })
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api'
import { useLoadGeneration } from '../composables/useLoadGeneration'
import type { DemoSummary, TagKeyInfo } from '../api/types'
import { tagLabel } from '../utils/funMode'
import { guessVendor } from '../utils/tagGroups'
import { chipLabel, intBounds, intBoundsOf, quickPresets, vendorDot } from '../utils/demoFacets'
import { useDemoFilters } from '../composables/useDemoFilters'
import { useFacetDrawer } from '../composables/useFacetDrawer'
import type { QuickPreset } from '../utils/demoFacets'
import { t, keyLabel, vendorLabel } from '../i18n'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'
import PromptDemoCard from '../components/PromptDemoCard.vue'
import RangeSlider from '../components/RangeSlider.vue'
import TagTip from '../components/TagTip.vue'

const demos = ref<DemoSummary[]>([])
const tagKeys = ref<TagKeyInfo[]>([])

// RF-4e：筛选状态 + URL 双向同步抽到 useDemoFilters（可单测；onChange 即原来的 reset()）
const {
  selectedTags,
  q,
  submittedQ,
  modelFilter,
  sort,
  cardMode,
  intRange,
  facetCount,
  syncQuery,
  applyRouteQuery,
  apply: applyFilters,
  setCardMode,
  initIntRanges,
} = useDemoFilters({ onChange: () => reset() })


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

// model 厂商分组：RF-4d 改用 utils/tagGroups 的共享实现
// （原先是与 TagPicker 逐字重复的一份 16 行前缀表，加厂商必须同时改两处）
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

// ---------- M1-A 分面抽屉（03 §4.2）：筛选收起为按钮 / 抽屉可钉住 / 移动 bottom-sheet ----------
// 形态：桌面 overlay（可钉住转常驻侧栏，localStorage 记忆）/ 移动（≤720）bottom-sheet
// （单组展开、应用即收、抽屉头「已选 N」）。钉住布局切换 0ms 硬切（t22/t23 口径：列宽
// 变化不做补间）；浮层/抽屉出场 stamp-in 微档、关闭 0ms 对称（03 §12.5 弹层语汇）。
// RF-4i：形态层（模式判定/开合/钉住持久化/Esc）抽到 useFacetDrawer；分组内容留在本视图。
const panelEl = ref<HTMLElement | null>(null)
const { isMobile, panelMode, showPanel, backdropActive, closeFacet, toggleFacet, pinFacet, unpinFacet } = useFacetDrawer({
  panelEl,
  onOpen: () => {
    // 移动端单组展开：进入 sheet 时收敛到恰好一组（无开着的组则落回模型组；米勒：一屏一事）。
    // 必须显式写 false——缺席键会回落「默认开」，光写一个 true 压不住其他组
    if (!isMobile.value) return
    const firstOpen = panelGroups.value.find((g) => isPanelOpen(g))?.group.key ?? 'model'
    const next: Record<string, boolean> = {}
    for (const g of panelGroups.value) next[g.group.key] = g.group.key === firstOpen
    panelOpen.value = next
  },
})

// 抽屉分面组序（03 §4.2）：模型置顶（厂商折叠）→ type/category/game → 技术键（可搜索）→ 数值键
type PanelEntry = { kind: 'model' | 'label' | 'tech' | 'int'; group: FilterGroup }
const LABEL_KEYS = ['type', 'category', 'game']
const panelGroups = computed<PanelEntry[]>(() => {
  const byKey = new Map(filterGroups.value.map((g) => [g.key, g]))
  const out: PanelEntry[] = []
  if (byKey.has('model')) out.push({ kind: 'model', group: byKey.get('model')! })
  for (const lk of LABEL_KEYS) if (byKey.has(lk)) out.push({ kind: 'label', group: byKey.get(lk)! })
  for (const g of filterGroups.value) {
    if (g.mode === 'int' || g.key === 'model' || LABEL_KEYS.includes(g.key)) continue
    out.push({ kind: 'tech', group: g })
  }
  for (const g of filterGroups.value) if (g.mode === 'int') out.push({ kind: 'int', group: g })
  return out
})
const firstTechIndex = computed(() => panelGroups.value.findIndex((g) => g.kind === 'tech'))

// 抽屉组手风琴：桌面多组并存；移动单组展开（toggle 时收掉其他组）
const panelOpen = ref<Record<string, boolean>>({})
function panelDefaultOpen(key: string) {
  return key === 'model' || LABEL_KEYS.includes(key)
}
function isPanelOpen(entry: PanelEntry) {
  // 技术键搜索中：有命中的组自动展开（否则搜到也看不见）
  if (entry.kind === 'tech' && techSearching.value) return techHasHit(entry.group)
  return panelOpen.value[entry.group.key] ?? panelDefaultOpen(entry.group.key)
}
function togglePanelGroup(entry: PanelEntry) {
  const key = entry.group.key
  const cur = panelOpen.value[key] ?? panelDefaultOpen(key)
  if (!cur && isMobile.value) {
    // 单组展开：其余组显式关掉（缺席键回落默认开，不能靠「只写一个 true」）
    const next: Record<string, boolean> = {}
    for (const g of panelGroups.value) next[g.group.key] = g.group.key === key
    panelOpen.value = next
    return
  }
  panelOpen.value = { ...panelOpen.value, [key]: !cur }
}
// 搜索中的技术键组头退化为静态（开合被搜索接管，按钮就是撒谎）
function panelHeadTag(entry: PanelEntry): 'button' | 'span' {
  return entry.kind === 'tech' && techSearching.value ? 'span' : 'button'
}

// 模型组：厂商分组折叠 + Top 值 + 搜索框（03 §4.2 抽屉首行）
const modelGroup = computed(() => filterGroups.value.find((g) => g.key === 'model') ?? null)
const modelSearch = ref('')
const modelSearching = computed(() => modelSearch.value.trim().length > 0)
const modelExpanded = computed(() => !!modelGroup.value && (isExpanded(modelGroup.value) || modelSearching.value))
const modelVendors = computed(() => {
  if (!modelGroup.value) return []
  const qs = modelSearch.value.trim().toLowerCase()
  const groups = vendorGroupsOf(modelGroup.value)
  if (!qs) return groups
  return groups
    .map((g) => ({ group: g.group, values: g.values.filter((v) => v.value.toLowerCase().includes(qs)) }))
    .filter((g) => g.values.length)
})
function vendorOpen(group: string) {
  return modelSearching.value || !isVendorCollapsed(group)
}

// 技术键：可搜索（值/键名/键标签子串命中）；命中组自动展开，无命中的组隐藏
const techSearch = ref('')
const techSearching = computed(() => techSearch.value.trim().length > 0)
function techHasHit(g: FilterGroup) {
  const qs = techSearch.value.trim().toLowerCase()
  if (!qs) return true
  return (
    g.values.some((v) => v.value.toLowerCase().includes(qs)) ||
    g.key.toLowerCase().includes(qs) ||
    g.label.toLowerCase().includes(qs)
  )
}
function techValues(g: FilterGroup) {
  const qs = techSearch.value.trim().toLowerCase()
  if (!qs) return visibleValues(g)
  return g.values.filter((v) => v.value.toLowerCase().includes(qs))
}

// 数值键：快捷档与范围计算已下沉到 utils/demoFacets（可单测）

function activeRangeOf(k: FilterGroup) {
  return selectedTags.value.find((t) => t.startsWith(k.key + ':')) || ''
}
function presetActive(k: FilterGroup, p: QuickPreset) {
  return activeRangeOf(k) === `${k.key}:${p.lo}-${p.hi}`
}
function applyIntRange(k: FilterGroup) {
  const r = intRange.value[k.key] || intBounds(k)
  const keyPrefix = k.key + ':'
  selectedTags.value = selectedTags.value.filter((t) => !t.startsWith(keyPrefix))
  if (r.lo <= r.hi) {
    selectedTags.value.push(`${k.key}:${r.lo}-${r.hi}`)
  }
  applyFilters()
}
function clearIntRange(k: FilterGroup) {
  intRange.value = { ...intRange.value, [k.key]: intBounds(k) }
  selectedTags.value = selectedTags.value.filter((t) => !t.startsWith(k.key + ':'))
  applyFilters()
}
function applyPreset(k: FilterGroup, p: QuickPreset) {
  intRange.value = { ...intRange.value, [k.key]: { lo: p.lo, hi: p.hi } }
  applyIntRange(k)
  // 应用即收（移动端）：档位打上就回列表看结果；再调再开，状态在 URL 里不丢
  if (isMobile.value) closeFacet()
}

function clearTags() {
  selectedTags.value = []
  modelFilter.value = ''
  applyFilters()
}

// 已选 chips 摘要（03 §4.2-1）已下沉到 utils/demoFacets.chipLabel
function clearModelFilter() {
  modelFilter.value = ''
  applyFilters()
}

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

/**
 * 世代号：加载期间换筛选必须能重查，而在途的旧响应绝不能污染新列表。
 *
 * 旧实现把 `loading` 同时当「UI 态」和「互斥锁」用（`if (loading.value) return`），
 * 于是出现真实可复现的 bug：首屏 `onMounted` 正在 `load(true)` 时点任一标签芯片 →
 * `reset()` 直接 return（不清列表也不重查）→ 紧接着 `syncQuery()` 已把 tag 写进 URL →
 * 路由 watch 触发 `applyRouteQuery()`，而它比较的是**已经改过的 ref** → 判定 changed=false
 * → 不重查。结果：芯片高亮、URL 是 ?tag=x、列表却是未筛选的旧数据，且不会自行恢复。
 * 搜索/排序/区间/清空全走同一条路径。
 *
 * 正解是世代号（不是简单删掉早退 —— 那样在途响应会把旧页 append 进新列表）。
 */
const gen = useLoadGeneration()

async function load(reset = false) {
  const my = gen.next()
  const p = reset ? 1 : page.value
  loading.value = true
  error.value = ''
  try {
    const res = await api.listDemos({
      status: 'approved',
      tags: selectedTags.value,
      q: submittedQ.value || undefined,
      model: modelFilter.value || undefined,
      sort: cardMode.value === 'prompt' ? 'prompt' : sort.value,
      page: p,
      page_size: pageSize,
    })
    if (!gen.isCurrent(my)) return // 作废：已有更新的请求发出/返回，旧结果不许写
    demos.value = reset ? res.items : [...demos.value, ...res.items]
    total.value = res.total
    page.value = p + 1
    hasMore.value = demos.value.length < res.total
  } catch (e) {
    if (!gen.isCurrent(my)) return
    error.value = (e as Error).message
  } finally {
    if (gen.isCurrent(my)) {
      loading.value = false
      refreshing.value = false
    }
  }
}

function reset() {
  gen.invalidate() // 作废在途请求（含「加载更多」——否则它的响应会 append 到新筛选的列表上）
  refreshing.value = true
  // 立即清空，显示明确加载态；不回顶，避免点击按钮时滚动条跳动
  demos.value = []
  error.value = ''
  page.value = 1
  hasMore.value = true
  void load(true)
}

function toggleTag(tg: string) {
  const i = selectedTags.value.indexOf(tg)
  if (i >= 0) selectedTags.value.splice(i, 1)
  else selectedTags.value.push(tg)
  applyFilters()
}
// 抽屉内点值 = 应用即收（移动端）：打上一个条件就回列表看结果（03 §4.2-6）。
// 只在「新增」时收——取消勾选是整理动作，留在抽屉里继续调更顺
function pickTag(tg: string) {
  const adding = !selectedTags.value.includes(tg)
  toggleTag(tg)
  if (adding && isMobile.value) closeFacet()
}

function applySort() {
  applyFilters()
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
  applyFilters()
}

function clearSearch() {
  q.value = ''
  if (submittedQ.value) {
    submittedQ.value = ''
    reset()
    syncQuery()
  }
}

// ---------- 空态三出口（03 §4.5；第 4 口「出一题」= M3 出题候选，留位不实装） ----------
const hasFilters = computed(() => selectedTags.value.length > 0 || !!modelFilter.value || !!submittedQ.value)
const emptyCondN = computed(() => facetCount.value + (submittedQ.value ? 1 : 0))
function relaxFilters() {
  // 放宽 = 去掉最后一个筛选重查（最后添加的最可能是压死结果的那根稻草）
  if (selectedTags.value.length) {
    selectedTags.value = selectedTags.value.slice(0, -1)
    reset()
    syncQuery()
    return
  }
  if (modelFilter.value) {
    clearModelFilter()
    return
  }
  if (submittedQ.value) clearSearch()
}
function switchToPrompt() {
  setCardMode('prompt')
}
// 论坛求助预填：携带当前筛选词进 /forum/new（ForumNewView 支持 ?title= 预填标题）
const askForumTo = computed(() => {
  const parts: string[] = []
  if (submittedQ.value) parts.push(`“${submittedQ.value}”`)
  for (const tg of selectedTags.value) parts.push(chipLabel(tg))
  if (modelFilter.value) parts.push('model:' + modelFilter.value)
  const title = t('demos.askTitle', '求助：找不到满足 {filters} 的作品', { filters: parts.join(' + ') || '…' })
  return { path: '/forum/new', query: { title } }
})


onMounted(async () => {
  // 从 URL query 还原状态
  applyRouteQuery()
  try {
    tagKeys.value = await api.listTagKeys()
  } catch {
    tagKeys.value = []
  }
  initIntRanges(tagKeys.value, intBoundsOf)
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
  <div class="route-page">  <section class="page-hero page-hero--compact">
    <span class="eyebrow">{{ t('app.nav.demos', '作品库') }}</span>
    <h1 class="page-title">{{ t('app.nav.demos', '作品库') }}</h1>
    <p class="sub">{{ t('demos.sub', '搜索、筛选、浏览全部 AI 网页 Demo —— 支持按标签与热度检索。') }}</p>
    <span class="mini-stat"><b>{{ total }}</b> {{ t('demos.works', '件作品') }}</span>
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
        <!-- 03 §4.3：「随机」在数据产品语境里像统计功能，「随便看看」表达消遣心智；移末位 -->
        <button class="tab" :class="{ active: sort === 'random' }" type="button" @click="sort = 'random'; applySort()">{{ t('demos.casual', '随便看看') }}</button>
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
      <!-- 筛选收起为按钮（03 §4.2-1：筛选是间歇动作，浏览是持续状态）；钉住态侧栏常驻，按钮隐 -->
      <button
        v-if="panelMode !== 'pinned'"
        class="btn btn-secondary facet-btn"
        type="button"
        :aria-expanded="showPanel"
        aria-controls="facet-panel"
        @click="toggleFacet"
      >
        {{ t('demos.facet', '筛选') }} ({{ facetCount }})
      </button>
    </div>

    <!-- 已应用搜索词 -->
    <div v-if="submittedQ" class="filter-row tag-selected-row">
      <span class="filter-label">{{ t('demos.search', '搜索') }}</span>
      <button class="tag-chip active" type="button" title="点击移除搜索" @click="clearSearch">
        {{ submittedQ }}<span class="chip-x">X</span>
      </button>
    </div>

    <!-- 已选 chips 摘要条（置顶、可单独/一键移除；含模型实体筛选，不再是无形条件） -->
    <div v-if="selectedTags.length || modelFilter" class="filter-row tag-selected-row">
      <span class="filter-label">{{ t('demos.selected', '已选') }}</span>
      <button
        v-if="modelFilter"
        class="tag-chip teal active"
        type="button"
        :title="t('demos.modelChipTip', '来自模型页的模型实体筛选')"
        @click="clearModelFilter"
      >
        model:{{ modelFilter }}<span class="chip-x">X</span>
      </button>
      <button
        v-for="tg in selectedTags"
        :key="tg"
        class="tag-chip active"
        type="button"
        @click="toggleTag(tg)"
      >
        {{ chipLabel(tg) }}<span class="chip-x">X</span>
      </button>
      <button class="btn btn-sm btn-dark" type="button" @click="clearTags">{{ t('demos.clearTags', '清除全部') }}</button>
    </div>

    <!-- 热门快捷（保留在搜索行下，高频条件前置 03 §4.2-5） -->
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
    </div>

    <div class="facet-body" :class="{ 'facet-body--pinned': panelMode === 'pinned' }">
      <div class="facet-main">
        <div v-if="error" class="notice notice-error">{{ error }}</div>

        <div v-if="loading && !demos.length" class="loading-row">
          <span class="spinner"></span> {{ refreshing ? t('demos.refreshing', '正在刷新…') : t('demos.loading', '加载 Demo 中…') }}
        </div>

        <div v-else-if="!demos.length" class="empty-box dv-empty">
          <p class="dv-empty-what">{{ t('demos.emptyWhat', '没有匹配的作品') }}</p>
          <p v-if="emptyCondN" class="muted dv-empty-why">
            {{ t('demos.emptyWhy', '当前 {n} 个条件交集为空 —— LIKE 搜索无相关性权重，长尾组合容易空手。', { n: emptyCondN }) }}
          </p>
          <!-- 空态三出口（03 §4.5）；第 4 口「这道题还没有？出一题」= M3 出题候选，留位待出题引擎 -->
          <div v-if="hasFilters" class="filter-row dv-empty-exits">
            <button class="btn btn-sm" type="button" @click="relaxFilters">{{ t('demos.relax', '放宽条件') }}</button>
            <button v-if="cardMode === 'normal'" class="btn btn-sm" type="button" @click="switchToPrompt">{{ t('demos.retryPrompt', '按提示词模式再看一次') }}</button>
            <RouterLink class="btn btn-sm btn-outline" :to="askForumTo">{{ t('demos.askForum', '去论坛求助') }}</RouterLink>
          </div>
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
      </div>

      <!-- 遮罩：overlay / bottom-sheet 共用（钉住态无遮罩） -->
      <div v-if="backdropActive" class="facet-backdrop" aria-hidden="true" @click="closeFacet"></div>

      <!-- 分面抽屉：桌面 overlay（可钉住） / 钉住=常驻侧栏 / 移动 bottom-sheet -->
      <aside
        v-if="showPanel"
        id="facet-panel"
        ref="panelEl"
        class="facet-panel"
        :class="'facet-panel--' + panelMode"
        role="dialog"
        :aria-label="t('demos.facetTitle', '分面筛选')"
        tabindex="-1"
      >
        <header class="fp-head">
          <b class="fp-title">{{ t('demos.facetTitle', '分面筛选') }}</b>
          <span class="fp-count">{{ t('demos.selectedN', '已选 {n}', { n: facetCount }) }}</span>
          <span class="fp-flex"></span>
          <button
            v-if="panelMode === 'overlay'"
            class="fp-pin"
            type="button"
            :title="t('demos.pinTip', '钉住为常驻侧栏（记忆）')"
            @click="pinFacet"
          >{{ t('demos.pin', '钉住') }}</button>
          <button
            v-else-if="panelMode === 'pinned'"
            class="fp-pin fp-pin--on"
            type="button"
            :title="t('demos.unpinTip', '取消钉住，回到浮层')"
            @click="unpinFacet"
          >{{ t('demos.unpin', '已钉住') }}</button>
          <button
            v-if="panelMode !== 'pinned'"
            class="fp-close"
            type="button"
            :aria-label="t('demos.close', '关闭')"
            @click="closeFacet"
          >X</button>
        </header>
        <!-- OR/AND 语义显性化（03 §4.2-3）：组间注一条（跨组叠加=且），组头注一条（同组任选=或）；
             移动端组头注被空间挤掉，OR 注并进这行（双语微文案在 ≤720 不失踪） -->
        <p class="fp-grammar">
          {{ t('demos.grammarAnd', '跨组叠加 = 且') }}
          <span class="fp-grammar-or-line"> · {{ t('demos.grammarOr', '同组任选 = 或') }}</span>
        </p>

        <div v-if="!panelGroups.length" class="fp-empty muted">{{ t('demos.noFacets', '暂无可用分面') }}</div>
        <template v-else>
          <template v-for="(g, gi) in panelGroups" :key="g.group.key">
            <!-- 技术键搜索框：悬在技术键段之前（该段唯一共享控件） -->
            <input
              v-if="gi === firstTechIndex"
              v-model="techSearch"
              class="input fp-search fp-search--tech"
              type="search"
              :placeholder="t('demos.searchTech', '搜索技术标签值…')"
              :aria-label="t('demos.searchTech', '搜索技术标签值…')"
            />
            <section class="fp-group" :class="'mode-' + g.group.mode">
              <component
                :is="panelHeadTag(g)"
                class="fp-group-head"
                :type="panelHeadTag(g) === 'button' ? 'button' : undefined"
                :aria-expanded="panelHeadTag(g) === 'button' ? isPanelOpen(g) : undefined"
                @click="panelHeadTag(g) === 'button' && togglePanelGroup(g)"
              >
                <span class="fp-caret" :class="{ open: isPanelOpen(g) }" aria-hidden="true">▸</span>
                <span class="fp-group-name">{{ keyLabel(g.group.key, g.group.label) }}</span>
                <code class="fp-group-code">{{ g.group.key }}</code>
                <span class="mode-dot" :class="'mode-dot-' + g.group.mode" aria-hidden="true"></span>
                <!-- int 组每次只允许一段范围（应用即替换），「同组任选」不适用——OR 注只在多选组出现 -->
                <span v-if="g.kind !== 'int'" class="fp-grammar-or">{{ t('demos.grammarOr', '同组任选 = 或') }}</span>
              </component>

              <div v-if="isPanelOpen(g)" class="fp-group-body">
                <!-- ① 模型组：厂商分组折叠保留 + 搜索框（Top 值） -->
                <template v-if="g.kind === 'model'">
                  <input v-model="modelSearch" class="input fp-search" type="search" :placeholder="t('demos.searchModels', '搜索模型…')" :aria-label="t('demos.searchModels', '搜索模型…')" />
                  <button v-if="!modelExpanded" class="tag-chip tag-strip-toggle" type="button" @click="toggleGroup(g.group)">
                    {{ t('demos.modelsExpandN', '模型 · 展开 +{n}', { n: g.group.values.length }) }}
                  </button>
                  <template v-else>
                    <div v-for="vg in modelVendors" :key="vg.group" class="vendor-strip">
                      <span class="vendor-strip-head" role="button" @click="toggleVendor(vg.group)">
                        <span class="vendor-dot" :style="{ background: vendorDot(vg.group) }"></span>
                        <span class="vendor-strip-name">{{ vendorLabel(vg.group) }}</span>
                        <span class="vendor-strip-toggle">{{ vendorOpen(vg.group) ? t('demos.collapse', '收起') : t('demos.expand', '展开') }}</span>
                      </span>
                      <div v-if="vendorOpen(vg.group)" class="filter-row" style="margin: 0">
                        <button
                          v-for="v in vg.values"
                          :key="v.value"
                          class="tag-chip mode-fixed"
                          :class="{ active: selectedTags.includes(g.group.key + ':' + v.value) }"
                          type="button"
                          @click="pickTag(g.group.key + ':' + v.value)"
                        >{{ tagLabel(v.value) }}<span class="count">{{ v.count }}</span><TagTip :tag-key="g.group.key" :value="v.value" :description="v.description" /></button>
                      </div>
                    </div>
                    <button v-if="!modelSearching" class="tag-chip tag-strip-toggle" type="button" @click="toggleGroup(g.group)">{{ t('demos.collapse', '收起') }}</button>
                    <span v-if="modelSearching && !modelVendors.length" class="muted fp-nomatch">{{ t('demos.searchNoHit', '无命中') }}</span>
                  </template>
                </template>

                <!-- ② type/category/game 与 ③ 技术键：同一套 chips（TagGroupBox 的厂商猜测分组
                     在抽屉里会渲染成多余的「其他」套盒，且 select 态无 TagTip——按 03 §4.2 线框
                     用 chips 直排；组盒仍服务探索页/面板展示形态） -->
                <template v-else-if="g.kind === 'label' || g.kind === 'tech'">
                  <div class="filter-row" style="margin: 0">
                    <button
                      v-for="v in (g.kind === 'tech' ? techValues(g.group) : visibleValues(g.group))"
                      :key="v.value"
                      class="tag-chip"
                      :class="['mode-' + g.group.mode, { active: selectedTags.includes(g.group.key + ':' + v.value) }]"
                      type="button"
                      @click="pickTag(g.group.key + ':' + v.value)"
                    >
                      {{ tagLabel(v.value) }}
                      <span class="count">{{ v.count }}</span>
                      <TagTip :tag-key="g.group.key" :value="v.value" :description="v.description" />
                    </button>
                    <button
                      v-if="g.kind === 'label' && isCollapsed(g.group) && g.group.values.length > COLLAPSED_SHOW"
                      class="tag-chip tag-strip-toggle"
                      type="button"
                      @click="toggleGroup(g.group)"
                    >
                      {{ t('demos.expandN', '展开 +{n}', { n: hiddenCount(g.group) }) }}
                    </button>
                    <button
                      v-if="g.kind === 'label' && !isCollapsed(g.group)"
                      class="tag-chip tag-strip-toggle"
                      type="button"
                      @click="toggleGroup(g.group)"
                    >
                      {{ t('demos.collapse', '收起') }}
                    </button>
                  </div>
                  <span v-if="g.kind === 'tech' && techSearching && !techHasHit(g.group)" class="muted fp-nomatch">{{ t('demos.searchNoHit', '无命中') }}</span>
                </template>

                <!-- ④ 数值键：快捷档 + 自定义滑条并存 -->
                <template v-else-if="g.kind === 'int'">
                  <div v-if="quickPresets(g.group).length" class="filter-row" style="margin: 0">
                    <button
                      v-for="p in quickPresets(g.group)"
                      :key="p.label"
                      class="tag-chip mode-int"
                      :class="{ active: presetActive(g.group, p) }"
                      type="button"
                      @click="applyPreset(g.group, p)"
                    >{{ p.label }}</button>
                  </div>
                  <div class="filter-row" style="margin: 0">
                    <RangeSlider :min="intBounds(g.group).lo" :max="intBounds(g.group).hi" v-model="intRange[g.group.key]" />
                    <button class="btn btn-sm btn-secondary" type="button" @click="applyIntRange(g.group); isMobile && closeFacet()">{{ t('demos.apply', '应用') }}</button>
                    <button v-if="activeRangeOf(g.group)" class="btn btn-sm btn-dark" type="button" @click="clearIntRange(g.group)">{{ t('demos.clearRange', '清除') }}</button>
                  </div>
                </template>
              </div>
            </section>
          </template>
        </template>
      </aside>
    </div>
  </section>
  </div>
</template>

<style scoped>
/* ============================================================
   M1-A 分面抽屉（03 §4.2）——styles/ 冻结令：新样式全 scoped，
   令牌经 var() 引用全局既有值并带字面回落（纸白兜底，双主题自动）。
   ============================================================ */
/* 主体栅格：钉住态=主列+340px 常驻侧栏；非钉住=单列。列宽变化 0ms 硬切（t22/t23 口径） */
.facet-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  transition: none;
}
.facet-body--pinned {
  grid-template-columns: minmax(0, 1fr) 340px;
}
.facet-main {
  min-width: 0;
}

.facet-backdrop {
  position: fixed;
  inset: 0;
  /* P0-2：44/45/46 是抽屉内部相对序（遮罩<浮层<底部 sheet），刻意保留字面量——
     局部层叠不进全局层表（token 见 tokens/primitives.css 的 --z-*）。 */
  z-index: 44;
  background: rgba(0, 0, 0, 0.32);
}

.facet-panel {
  /* 三律 1 无边框（05 §5.2）：去 4px 边框与 8px 双向影——纯色填充直接着地，
     唯一视觉边界=外部投影一刀（--shadow-black 单源硬影） */
  border: none;
  background: var(--paper, #fff);
  box-shadow: var(--shadow-black, 6px 0 0 var(--ink, #000));
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* 浮层：顶栏之下、TagTip(z60) 之上的 drawer 段位；入场=b-stamp-drop 350ms 落下回弹一次（关闭 0ms 对称） */
.facet-panel--overlay {
  position: fixed;
  top: 78px;
  right: 16px;
  bottom: 16px;
  width: min(360px, calc(100vw - 32px));
  z-index: 45;
  overflow-y: auto;
  overscroll-behavior: contain;
  animation: b-stamp-drop var(--b-dur-stage, 350ms) var(--b-ease-stamp, cubic-bezier(0.16, 1, 0.3, 1)) both;
}
/* 移动 bottom-sheet：贴底上收，安全区垫底；入场=贴边方向镜像落下（从下方 24px 升起同帧谱） */
.facet-panel--sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 46;
  max-height: 76vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  animation: fp-drop-up var(--b-dur-stage, 350ms) var(--b-ease-stamp, cubic-bezier(0.16, 1, 0.3, 1)) both;
}
/* b-stamp-drop 的贴边镜像（bottom-sheet 专用，帧谱同 05 §5.2：升起→overshoot→回弹→落定） */
@keyframes fp-drop-up {
  0% { transform: translateY(24px); opacity: 0; }
  58% { transform: translateY(-3px); opacity: 1; }
  80% { transform: translateY(1px); }
  100% { transform: translateY(0); }
}
/* 钉住=栅格成员常驻侧栏：sticky 跟随，随列内滚动。
   入场保持 0ms 硬切（t22/t23 裁决优先：列宽变化不补间——钉住是栅格成员不是弹层，
   与「三态同 drop」的字面分歧记录给 t34 走查仲裁） */
.facet-panel--pinned {
  position: sticky;
  top: 78px;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  overscroll-behavior: contain;
  align-self: start;
}
@media (prefers-reduced-motion: reduce) {
  .facet-panel--overlay,
  .facet-panel--sheet {
    animation: none;
  }
}

.fp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--ink, #000);
  color: var(--paper, #fff);
  position: sticky;
  top: 0;
  z-index: var(--z-overlay);
}
.fp-title {
  font-family: var(--font-heading, sans-serif);
  font-weight: 900;
  text-transform: uppercase;
  font-size: 13px;
  letter-spacing: 0.04em;
}
.fp-count {
  font-family: var(--font-body, monospace);
  font-size: 11px;
  font-weight: 700;
  background: var(--paper, #fff);
  color: var(--ink, #000);
  padding: 1px 7px;
}
.fp-flex {
  flex: 1;
}
.fp-pin {
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: transparent;
  color: var(--paper, #fff);
  border: 2px solid var(--paper, #fff);
  padding: 3px 8px;
  cursor: pointer;
}
@media (hover: hover) {
  .fp-pin:hover {
    background: var(--paper, #fff);
    color: var(--ink, #000);
  }
}
.fp-pin:active {
  transform: translate(2px, 2px);
  transition-duration: 0ms;
}
.fp-pin--on {
  background: var(--yellow, #ffd93d);
  color: var(--ink, #000);
  border-color: var(--ink, #000);
}
.fp-close {
  font: inherit;
  font-weight: 900;
  font-size: 14px;
  background: transparent;
  border: none;
  color: var(--paper, #fff);
  cursor: pointer;
  min-width: 44px; /* 触达底线（sheet 关闭键在移动端） */
  min-height: 44px;
}
.fp-grammar {
  margin: 0;
  padding: 8px 12px 0;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: var(--ink-soft, #555);
}
.fp-empty {
  padding: 18px 12px;
  font-size: 13px;
}
.fp-search {
  width: 100%;
}
.fp-search--tech {
  margin-bottom: 8px;
}
.fp-nomatch {
  font-size: 12px;
}

/* 组（手风琴）：三律 2 实线分割（05 §5.2）——组间 2px 实线 divider，节奏靠线不靠盒；
   头=44px 触达线 + 11px 大写字距小标题；组间注=组头右侧的 OR 微文案 */
.fp-group {
  border-top: 2px solid var(--ink, #000);
}
.fp-group:first-of-type {
  border-top: none;
}
.fp-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
  color: var(--ink, #000);
}
span.fp-group-head {
  cursor: default;
}
@media (hover: hover) {
  button.fp-group-head:hover {
    background: var(--paper-deep, #f2eee6);
  }
}
.fp-caret {
  display: inline-block;
  font-weight: 900;
  font-size: 11px;
  transition: transform var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1));
}
.fp-caret.open {
  transform: rotate(90deg);
}
.fp-group-name {
  font-weight: 900;
  font-size: 11px; /* 三律 2：组头=11px 大写字距小标题（05 §5.2） */
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.fp-group-code {
  font-size: 10px;
  color: var(--ink-soft, #555);
}
.fp-grammar-or {
  margin-left: auto;
  font-size: 10px;
  color: var(--ink-soft, #555);
  white-space: nowrap;
}
@media (max-width: 720px) {
  /* 移动：头拥挤，OR 注从组头隐（fp-grammar 行并入了 OR/AND 全语义） */
  .fp-grammar-or {
    display: none;
  }
  .facet-body--pinned {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (min-width: 720.02px) {
  /* 桌面：组头已有 OR 注，行内不重复 */
  .fp-grammar-or-line {
    display: none;
  }
}
.fp-group-body {
  padding: 2px 12px 12px;
  display: grid;
  gap: 8px;
}

/* 空态三出口（03 §4.5） */
.dv-empty {
  padding: 28px 16px;
}
.dv-empty-what {
  font-family: var(--font-heading, sans-serif);
  font-weight: 900;
  font-size: 17px;
  margin: 0 0 6px;
}
.dv-empty-why {
  font-size: 12px;
  margin: 0 0 14px;
  max-width: 52ch;
  margin-left: auto;
  margin-right: auto;
}
.dv-empty-exits {
  justify-content: center;
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .fp-caret {
    transition: none;
  }
}
</style>
