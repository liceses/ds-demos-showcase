<script setup lang="ts">
// 模型列表页（v2 B2′）：Model 升为一级导航轴的落点。
// Explore 降级为「模型列表 + 题目列表」两个入口（评审与重排.md idea 7 裁决），不做四段聚合大页。
defineOptions({ name: 'ModelsView' })
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { ModelSummary } from '../api/types'
import { tagLabel } from '../utils/funMode'
import { entityStatusClass, sampleLabel, sampleClass } from '../utils/modelDisplay'
import { t } from '../i18n'
import EntityStamp from '../components/EntityStamp.vue'
import PaginationBar from '../components/PaginationBar.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { useListPage } from '../composables/useListPage'

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
  { key: 'new', label: () => t('models.sortNew', '最新收录') },
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
  <div class="route-page">  <section class="page-hero page-hero--compact">
    <span class="eyebrow">{{ t('models.eyebrow', '模型图鉴') }}</span>
    <h1 class="page-title">{{ t('models.title', '模型') }}</h1>
    <p class="sub">{{ t('models.sub', '每个模型在这一年里真正做过什么 —— 从作品反推它的行为，不给综合分。') }}</p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="tag-stat"><b>{{ total }}</b> {{ t('models.count', '个模型') }}</span>
    </div>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="toolbar">
      <div class="search-box" style="flex: 1; max-width: 320px">
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

    <div v-else class="model-list">
      <article v-for="m in items" :key="m.slug" class="model-row card card-entity">
        <RouterLink class="model-row-stamp" :to="`/models/${m.slug}`">
          <EntityStamp :name="m.name" :vendor="m.vendor" size="md" />
        </RouterLink>
        <div class="model-row-main">
          <RouterLink class="model-row-name" :to="`/models/${m.slug}`">{{ tagLabel(m.name) }}</RouterLink>
          <div class="model-row-meta">
            <span v-if="m.vendor" class="mini-stat"><b>{{ m.vendor }}</b> {{ t('models.vendor', '厂商') }}</span>
            <span v-if="m.status !== 'active'" class="mode-badge" :class="entityStatusClass(m.status)">{{ statusText[m.status] || m.status }}</span>
            <span v-if="m.description" class="muted model-row-desc">{{ m.description }}</span>
          </div>
        </div>
        <div class="model-row-stats">
          <span class="stat stat-teal">DEMO {{ m.demo_count }}</span>
          <!-- 分数换成收缩后的社区分，并显式标出证据量（票数 + 样本档）—— 旧口径下 1 票 5.0 能压过 40 票 4.7 -->
          <span class="stat stat-mint" :title="t('models.scoreTip', '社区分＝按票数加权均分向全站先验收缩；票数越少越靠近平均线')">
            SCORE {{ m.score != null ? m.score.toFixed(2) : '—' }}
          </span>
          <span :class="sampleClass(m.sample_level)" :title="t('models.sampleTip', '票数决定这个分数能信几分')">
            <b>{{ m.votes ?? 0 }}</b>{{ t('models.votesUnit', '票') }} · {{ sampleLabel(m.sample_level) }}
          </span>
        </div>
        <div class="model-row-cta">
          <RouterLink class="btn btn-sm btn-outline" :to="`/demos?model=${m.slug}`">{{ t('models.works', '全部作品 →') }}</RouterLink>
        </div>
      </article>
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
