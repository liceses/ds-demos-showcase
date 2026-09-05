<script setup lang="ts">
// 模型页（v2）：按文档 §11「模型主页」= 这个模型在真实 Demo 世界里的行为档案。
// 作品数 / 参与任务 / 常见类型 / 常见玩法 / 热门任务（同题对比入口）/ 可分页可排序的作品清单。
// 关于"分数"：这里显示的是**收缩后的社区分**（(wsum+m·C)/(v+m)，全站先验自动暴露），
// 它不是对模型能力的裁判，而是"本站作品与评分这些事实的摘要"—— 所以必须并列票数与样本档。
// （旧注释写的"不做模型评分"已作废，见 docs/deepdemosv2/优化设计-模型展示与后台.md §3。）
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import type { DemoSummary, ModelDetail } from '../api/types'
import { parseDate, currentLocale } from '../utils/time'
import { tagLabel } from '../utils/funMode'
import { entityStatusClass, sampleLabel, sampleClass } from '../utils/modelDisplay'
import { t } from '../i18n'
import EntityStamp from '../components/EntityStamp.vue'
import DemoCard from '../components/DemoCard.vue'
import MasonryGrid from '../components/MasonryGrid.vue'
import SectionHead from '../components/SectionHead.vue'

const route = useRoute()
const router = useRouter()
const model = ref<ModelDetail | null>(null)
const loading = ref(true)
const error = ref('')

// ---------- 作品清单：分页 + 排序 + facet（旧实现硬编码 12 件，396 件只能看 3%） ----------
type DemoSort = 'newest' | 'score' | 'popular'
const demoSort = ref<DemoSort>((['newest', 'score', 'popular'] as const).includes(route.query.sort as DemoSort) ? (route.query.sort as DemoSort) : 'newest')
const facetType = ref(typeof route.query.type === 'string' ? route.query.type : '')
const demoItems = ref<DemoSummary[]>([])
const demoTotal = ref(0)
const demoPage = ref(1)
const demoLoading = ref(false)
// 首屏 12 件（与旧版一致，不加重首屏），每次"再显示"补 24 件
const FIRST = 12
const STEP = 24

async function loadDemos(reset = true) {
  if (!model.value) return
  if (demoLoading.value) return
  demoLoading.value = true
  try {
    const r = await api.getModelDemos(model.value.slug, {
      sort: demoSort.value,
      type: facetType.value || undefined,
      page: reset ? 1 : demoPage.value + 1,
      page_size: reset ? FIRST : STEP,
    })
    demoItems.value = reset ? r.items : [...demoItems.value, ...r.items]
    demoTotal.value = r.total
    demoPage.value = r.page
    // 排序/筛选写进 URL：可分享、后退不丢位置（无限滚动的替代品）
    const q: Record<string, string> = {}
    if (demoSort.value !== 'newest') q.sort = demoSort.value
    if (facetType.value) q.type = facetType.value
    void router.replace({ query: q })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    demoLoading.value = false
  }
}

function setSort(s: DemoSort) {
  demoSort.value = s
  void loadDemos(true)
}
function setFacet(v: string) {
  facetType.value = facetType.value === v ? '' : v
  void loadDemos(true)
}

const statusText: Record<string, string> = {
  unverified: 'canary',
  candidate: 'pending',
  deprecated: 'retired',
  active: '',
}

async function load() {
  loading.value = true
  error.value = ''
  model.value = null
  try {
    model.value = await api.getModel(String(route.params.slug))
    demoItems.value = []
    demoPage.value = 1
    void loadDemos(true)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(() => route.params.slug, load, { immediate: true })
</script>

<template>
  <div class="route-page">  <section v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('models.loading', '加载模型…') }}</section>

  <!-- 错误态必须给出口：只有一行红字等于把用户困在死路上（截图里就出现过裸 "Not Found"） -->
  <section v-else-if="error" class="empty-box">
    <p style="margin-bottom: 6px">{{ t('models.loadFailed', '这个模型页没能加载出来') }}</p>
    <p class="muted mono" style="font-size: 12px; margin: 0 0 14px">{{ error }}</p>
    <div class="filter-row" style="justify-content: center">
      <button class="btn btn-sm btn-primary" type="button" @click="load">↻ {{ t('models.retry', '重试') }}</button>
      <RouterLink class="btn btn-sm btn-outline" to="/models">{{ t('models.backList', '返回模型列表') }}</RouterLink>
      <RouterLink class="btn btn-sm btn-outline" to="/tags">{{ t('models.backExplore', '去探索') }}</RouterLink>
    </div>
  </section>

  <template v-else-if="model">
    <section class="page-hero" style="padding-bottom: 20px">
      <div class="model-hero-head">
        <EntityStamp :name="model.name" :vendor="model.vendor" size="lg" />
        <div>
          <h1 class="huge" style="margin-top: 0">{{ tagLabel(model.name) }}</h1>
          <div class="filter-row" style="margin-top: 6px; gap: 8px">
            <span v-if="model.vendor" class="mini-stat"><b>{{ model.vendor }}</b> {{ t('models.vendor', '厂商') }}</span>
            <span v-if="model.status !== 'active'" class="mode-badge" :class="entityStatusClass(model.status)">
              {{ t('models.status_' + (statusText[model.status] || model.status), model.status) }}
            </span>
            <span v-for="a in model.aliases.slice(0, 3)" :key="a" class="mini-stat mono">{{ a }}</span>
          </div>
        </div>
      </div>
      <p v-if="model.description" class="sub" style="margin-top: 10px">{{ model.description }}</p>
    </section>

    <!-- 档案统计：分数是"事实的摘要"（收缩社区分），必须与票数、样本档同屏 -->
    <div class="dash-stats">
      <div class="stat-card stat-ok"><b>{{ model.demo_count }}</b>{{ t('models.demos', '作品') }}</div>
      <div class="stat-card"><b>{{ model.tasks.length }}</b>{{ t('models.tasks', '参与任务') }}</div>
      <div class="stat-card" :class="model.score != null ? 'stat-mint' : ''">
        <b>{{ model.score != null ? model.score.toFixed(2) : '—' }}</b>
        {{ t('models.communityScore', '社区分') }}
        <span :class="sampleClass(model.sample_level)">
          <b>{{ model.votes ?? 0 }}</b>{{ t('models.votesUnit', '票') }} · {{ sampleLabel(model.sample_level) }}
        </span>
      </div>
      <div v-if="model.rating_avg != null && model.score != null && Math.abs(model.rating_avg - model.score) >= 0.15" class="stat-card">
        <b>{{ model.rating_avg.toFixed(2) }}</b>{{ t('models.rawAvg', '未加权均分') }}
        <span class="stat-sub">{{ t('models.rawHint', '与社区分的差＝小样本被收缩') }}</span>
      </div>
    </div>

    <!-- 行为档案：常见类型 / 常见玩法（技术分布待技术标签键建立后接入） -->
    <div class="archive-grid">
      <div class="card card-default archive-card">
        <h3 class="archive-title">{{ t('models.typesTitle', '常见类型') }}</h3>
        <div v-if="model.type_dist.length" class="dist-rows">
          <div v-for="d in model.type_dist" :key="d.value" class="dist-row">
            <RouterLink class="dist-name" :to="`/tag/type/${d.value}`">{{ d.value }}</RouterLink>
            <span class="dist-count">{{ d.demos }}</span>
          </div>
        </div>
        <p v-else class="muted" style="font-size: 13px; margin: 0">{{ t('models.emptyTypes', '暂无类型标签') }}</p>
      </div>
      <div class="card card-default archive-card">
        <h3 class="archive-title">{{ t('models.gamesTitle', '常见玩法') }}</h3>
        <div v-if="model.game_dist.length" class="dist-rows">
          <div v-for="d in model.game_dist" :key="d.value" class="dist-row">
            <RouterLink class="dist-name" :to="`/tag/game/${d.value}`">{{ d.value }}</RouterLink>
            <span class="dist-count">{{ d.demos }}</span>
          </div>
        </div>
        <p v-else class="muted" style="font-size: 13px; margin: 0">{{ t('models.emptyGames', '暂无玩法标签') }}</p>
      </div>
    </div>

    <!-- 热门任务（同题对比入口）：每行 = 任务 + 该模型作品数 + 对比视图 -->
    <SectionHead :title="t('models.hotTasks', '热门任务')" style="margin-top: 28px">
      <span class="muted" style="font-size: 13px">{{ t('models.compareSub', '进入任务即可与其他模型同题对比') }}</span>
    </SectionHead>
    <div v-if="!model.tasks.length" class="empty-box">{{ t('models.emptyTasks', '还没有参与任务') }}</div>
    <div v-else class="task-lines">
      <RouterLink v-for="tk in model.tasks" :key="tk.slug" class="task-line" :to="`/tasks/${tk.slug}`">
        <span class="task-line-title">{{ tk.title }}</span>
        <span class="task-line-count">{{ t('models.taskWorks', '{n} 个作品', { n: tk.demo_count }) }}</span>
        <span class="task-line-cta">{{ t('models.compareCta', '同题对比 →') }}</span>
      </RouterLink>
    </div>

    <!-- 作品清单：默认按时间（与旧版一致），排序与筛选可切换且写进 URL -->
    <SectionHead :title="t('models.recent', '最近作品')" style="margin-top: 28px">
      <div class="filter-row" style="margin: 0">
        <button
          v-for="o in ([['newest', t('models.sortNew', '最新')], ['score', t('models.sortScore', '社区分')], ['popular', t('models.sortPopular', '最热')]] as [DemoSort, string][])"
          :key="o[0]"
          type="button"
          class="tag-chip"
          :class="{ active: demoSort === o[0] }"
          @click="setSort(o[0])"
        >{{ o[1] }}</button>
        <span class="muted mono" style="font-size: 12px">{{ demoItems.length }} / {{ demoTotal }}</span>
      </div>
    </SectionHead>
    <!-- facet：用本页已有的类型分布做筛选，答的是"它擅长做什么" -->
    <div v-if="model.type_dist.length" class="filter-row" style="margin: 0 0 12px">
      <span class="filter-label">{{ t('models.facetLabel', '按类型筛') }}</span>
      <button
        v-for="d in model.type_dist.slice(0, 6)"
        :key="d.value"
        type="button"
        class="tag-chip mode-fixed"
        :class="{ active: facetType === d.value }"
        @click="setFacet(d.value)"
      >{{ d.value }}<span class="count">{{ d.demos }}</span></button>
    </div>
    <div v-if="!demoItems.length && !demoLoading" class="empty-box">{{ t('models.empty', '这个模型还没有作品，来投第一篇 →') }}</div>
    <MasonryGrid v-else :cols="3" :items="demoItems" :item-key="(d: unknown) => (d as { slug: string }).slug">
      <template #default="{ item }">
        <DemoCard :demo="item as (typeof demoItems)[number]" />
      </template>
    </MasonryGrid>
    <div class="filter-row" style="justify-content: center; margin-top: 14px">
      <button
        v-if="demoItems.length < demoTotal"
        class="btn btn-secondary"
        type="button"
        :disabled="demoLoading"
        @click="loadDemos(false)"
      >
        {{ demoLoading ? '…' : t('models.loadMore', '再显示 {n} 件', { n: STEP }) }}
      </button>
      <span v-else-if="demoTotal > FIRST" class="muted mono">{{ t('models.bottom', '到底了 · 共 {n} 件，试试按社区分排', { n: demoTotal }) }}</span>
    </div>

    <p class="muted mono" style="text-align: center; margin-top: 24px">
      {{ t('models.since', '收录') }} {{ parseDate(model.created_at).toLocaleDateString(currentLocale()) }}
    </p>
  </template>
  </div>
</template>
