<script setup lang="ts">
// 题目列表页（v2 B3′）：Benchmark 的入口清单 —— 一题一行，点进去是同题多模型对比。
// Explore 降级为「模型 + 题目」两个入口（评审与重排.md idea 7 裁决），不做四段聚合大页。
defineOptions({ name: 'TasksView' })
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { TaskSummary } from '../api/types'
import { parseDate, currentLocale } from '../utils/time'
import { t } from '../i18n'
import EntityStamp from '../components/EntityStamp.vue'
import PaginationBar from '../components/PaginationBar.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { useListPage } from '../composables/useListPage'
import PageHero from '../components/PageHero.vue'
import CoverImg from '../components/CoverImg.vue'

const q = ref('')
const sort = ref<'demos' | 'newest'>('demos')

const { items, total, page, pageSize, loading, error, load, apply } = useListPage<TaskSummary>(
  async ({ page, page_size }) => {
    const res = await api.listTasks({ q: q.value.trim() || undefined, sort: sort.value, page, page_size })
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
    <span class="eyebrow">{{ t('tasks.eyebrow', '题目图鉴') }}</span>
    <h1 class="page-title">{{ t('tasks.title', '题目') }}</h1>
    <p class="sub">{{ t('tasks.sub', '同一道题，不同模型各交了什么 —— 题目是本站的比较单位。') }}</p>
    <div class="filter-row" style="margin-top: var(--sp-16)">
      <span class="mini-stat"><b>{{ total }}</b> {{ t('tasks.count', '道题目') }}</span>
    </div>
  </PageHero>

  <section class="section" style="padding-top: var(--sp-8)">
    <div class="toolbar">
      <div class="search-box search-box--grow search-box--sm">
        <input
          v-model="q"
          class="input"
          type="search"
          :placeholder="t('tasks.searchPh', '搜索题目…（回车提交）')"
          @keyup.enter="apply"
        />
        <button class="btn btn-secondary search-submit" type="button" @click="apply">{{ t('common.search', '搜索') }}</button>
      </div>
      <div class="tabs" style="margin: 0">
        <button class="tab" :class="{ active: sort === 'demos' }" type="button" @click="changeSort('demos')">{{ t('tasks.sortDemos', '作品最多') }}</button>
        <button class="tab" :class="{ active: sort === 'newest' }" type="button" @click="changeSort('newest')">{{ t('tasks.sortNew', '最新') }}</button>
      </div>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading && !items.length" :text="t('tasks.loadingList', '加载题目…')" />
    <EmptyBox v-else-if="!items.length" :text="t('tasks.emptyList', '还没有题目')" />

    <div v-else class="task-grid">
      <RouterLink v-for="tk in items" :key="tk.slug" :to="`/tasks/${tk.slug}`" class="task-card b-lift">
        <span class="task-card-cover">
          <!-- 封面 = 最强的识别线索（评审页 task-grid）：卡片宽约 300px，2x 屏需 ~600px ⇒ 用 640 档（由原图 URL 推导）；
             后端未给原图时回落 200 档缩略图，再不行 CoverImg 自己回落原图 → 不会裂图 -->
          <CoverImg v-if="tk.cover_url || tk.cover_thumb_url" :src="tk.cover_url || tk.cover_thumb_url" tier="card" alt="" />
          <EntityStamp v-else :name="tk.title" size="md" />
        </span>
        <span class="task-card-name">{{ tk.title }}<i class="model-card-arrow" aria-hidden="true">→</i></span>
        <span class="task-card-meta">
          <span v-if="tk.category" class="mini-stat"><b>{{ tk.category }}</b> {{ t('tasks.category', '分类') }}</span>
          <span class="muted">{{ parseDate(tk.created_at).toLocaleDateString(currentLocale()) }}</span>
        </span>
        <!-- 题面优先用作者写的描述；成题自动建的题目没描述，就取该题下的提示词摘录 -->
        <span v-if="tk.description || tk.prompt_excerpt" class="task-card-desc">
          <span v-if="!tk.description" class="task-row-tag mono">{{ t('tasks.promptTag', '题面') }}</span>
          <span :class="{ muted: !tk.description }">{{ tk.description || tk.prompt_excerpt }}</span>
        </span>
        <span class="task-card-stats"><span class="stat stat-teal">DEMO {{ tk.demo_count }}</span></span>
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
