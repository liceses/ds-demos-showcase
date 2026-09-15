<script setup lang="ts">
// 模型列表页（v2 B2′）：Model 升为一级导航轴的落点。
// Explore 降级为「模型列表 + 题目列表」两个入口（评审与重排.md idea 7 裁决），不做四段聚合大页。
defineOptions({ name: 'ModelsView' })
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { ModelSummary } from '../api/types'
import { tagLabel } from '../utils/funMode'
import { entityStatusClass } from '../utils/modelDisplay'
import { iconInkFor, vendorIcon } from '../utils/vendorIcon'
import { t } from '../i18n'
import PaginationBar from '../components/PaginationBar.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { useListPage } from '../composables/useListPage'
import PageHero from '../components/PageHero.vue'

const q = ref('')
const sort = ref<'demos' | 'score' | 'votes' | 'new' | 'name'>('demos')

// 状态文案与 Model 详情页保持同一口径（canary = 灰测未验证）
const statusText: Record<string, string> = {
  unverified: 'canary',
  candidate: 'pending',
  deprecated: 'retired',
  active: '',
}

const sorts = [
  { key: 'demos', label: () => t('models.sortDemos', '作品最多') },
  { key: 'score', label: () => t('models.sortRating', '社区分最高') },
  { key: 'votes', label: () => t('models.sortVotes', '最多票') },
  { key: 'new', label: () => t('models.sortNew', '最新') },
  { key: 'name', label: () => t('models.sortName', '名称') },
] as const

const { items, total, page, pageSize, loading, error, load, apply } = useListPage<ModelSummary>(
  async ({ page, page_size }) => {
    const res = await api.listModels({
      q: q.value.trim() || undefined,
      sort: sort.value,
      page,
      page_size,
    })
    return { items: res.items, total: res.total }
  },
  24,
)

function changeSort(s: typeof sort.value) {
  if (sort.value === s) return
  sort.value = s
  void apply()
}

onMounted(load)
</script>

<template>
  <div class="route-page">  <PageHero>
    <span class="eyebrow">{{ t('models.eyebrow', '模型图鉴') }}</span>
    <h1 class="page-title">{{ t('models.title', '模型') }}</h1>
    <p class="sub">{{ t('models.sub', '每个模型在这一年里真正做过什么 —— 从作品反推它的行为，不给综合分。') }}</p>
    <div class="filter-row" style="margin-top: var(--sp-16)">
      <span class="mini-stat"><b>{{ total }}</b> {{ t('models.count', '个模型') }}</span>
    </div>
  </PageHero>

  <section class="section" style="padding-top: var(--sp-8)">
    <div class="toolbar">
      <div class="search-box search-box--grow search-box--sm">
        <input
          v-model="q"
          class="input"
          type="search"
          :placeholder="t('models.searchPh', '搜索模型 / 别名…（回车提交）')"
          @keyup.enter="apply"
        />
        <button class="btn btn-secondary search-submit" type="button" @click="apply">{{ t('common.search', '搜索') }}</button>
      </div>
      <div class="tabs" style="margin: 0">
        <button
          v-for="s in sorts"
          :key="s.key"
          class="tab"
          :class="{ active: sort === s.key }"
          type="button"
          @click="changeSort(s.key)"
        >{{ s.label() }}</button>
      </div>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading && !items.length" :text="t('models.loadingList', '加载模型…')" />
    <EmptyBox v-else-if="!items.length" :text="t('models.emptyList', '还没有模型条目')" />

    <div v-else class="explore-grid">
      <RouterLink
        v-for="m in items"
        :key="m.slug"
        class="explore-cell card card-entity b-lift"
        :class="{ 'is-embedded': !!vendorIcon(m.vendor) }"
        :style="vendorIcon(m.vendor) ? { '--vendor': vendorIcon(m.vendor)!.hex } : undefined"
        :to="`/models/${m.slug}`"
      >
        <!-- 完整 D 变体（与探索页逐字一致）：半嵌入图标块（上凸 10px）+ 底色=厂商色 + 顶带/左带把边框染成厂商色；
             无图标厂商回退字母章（无色无带）—— **回退本身也是设计的一部分**，不是缺失 -->
        <template v-if="vendorIcon(m.vendor)">
          <span class="explore-band explore-band--top" aria-hidden="true"></span>
          <span class="explore-band explore-band--left" aria-hidden="true"></span>
          <span class="explore-tile" aria-hidden="true" :style="{ background: vendorIcon(m.vendor)!.hex, color: iconInkFor(vendorIcon(m.vendor)!.hex) }">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path v-for="(d, i) in vendorIcon(m.vendor)!.paths" :key="i" :d="d" />
            </svg>
          </span>
        </template>
        <span v-else class="explore-tile explore-tile--letter" aria-hidden="true">{{ (m.vendor || m.name || '?').slice(0, 1).toUpperCase() }}</span>

        <div class="explore-cell-main">
          <div class="explore-cell-name">{{ tagLabel(m.name) }}</div>
          <div class="explore-cell-meta">
            <span class="explore-vendor mono">{{ m.vendor || t('explore.noVendor', '未标厂商') }} · {{ m.demo_count }} {{ t('models.works', '作品') }}</span>
          </div>
          <div class="explore-cell-meta">
            <!-- 分数口径与探索页一致：显示收缩后的社区分（旧口径下 1 票 5.0 能压过 40 票 4.7） -->
            <span v-if="m.score != null" class="stat stat-mint" :title="t('models.scoreTip', '社区分＝按票数加权均分向全站先验收缩；票数越少越靠近平均线')">SCORE {{ m.score.toFixed(2) }}</span>
            <span v-if="m.votes" class="mini-stat mono">{{ m.votes }}{{ t('models.votesUnit', '票') }}</span>
            <span v-if="m.status !== 'active'" class="mode-badge" :class="entityStatusClass(m.status)">{{ statusText[m.status] || m.status }}</span>
          </div>
        </div>
      </RouterLink>
    </div>

    <PaginationBar
      v-if="items.length"
      :page="page"
      :total="total"
      :page-size="pageSize"
      @change="(p) => { page = p; load() }"
    />
  </section>
  </div>
</template>
