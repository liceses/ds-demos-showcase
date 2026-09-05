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
  <div class="route-page">  <section class="page-hero">
    <span class="eyebrow">{{ t('tasks.eyebrow', '题目图鉴') }}</span>
    <h1 class="huge" style="margin-top: 14px">{{ t('tasks.title', '题目') }}</h1>
    <p class="sub">{{ t('tasks.sub', '同一道题，不同模型各交了什么 —— 题目是本站的比较单位。') }}</p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="tag-stat"><b>{{ total }}</b> {{ t('tasks.count', '道题目') }}</span>
    </div>
  </section>

  <section class="section" style="padding-top: 8px">
    <div class="toolbar">
      <div class="search-box" style="flex: 1; max-width: 320px">
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

    <div v-else class="task-list">
      <RouterLink v-for="tk in items" :key="tk.slug" :to="`/tasks/${tk.slug}`" class="task-row card card-entity">
        <EntityStamp :name="tk.title" size="md" />
        <div class="task-row-main">
          <div class="task-row-title">{{ tk.title }}</div>
          <div class="task-row-meta">
            <span v-if="tk.category" class="mini-stat"><b>{{ tk.category }}</b> {{ t('tasks.category', '分类') }}</span>
            <span class="muted">{{ parseDate(tk.created_at).toLocaleDateString(currentLocale()) }}</span>
          </div>
          <!-- 题面优先用作者写的描述；成题自动建的题目没描述，就取该题下的提示词摘录 -->
          <p v-if="tk.description || tk.prompt_excerpt" class="task-row-desc">
            <span v-if="!tk.description" class="task-row-tag mono">{{ t('tasks.promptTag', '题面') }}</span>
            <span :class="{ muted: !tk.description }">{{ tk.description || tk.prompt_excerpt }}</span>
          </p>
        </div>
        <div class="task-row-stats">
          <span class="stat stat-teal">DEMO {{ tk.demo_count }}</span>
        </div>
        <span class="task-row-cta">{{ t('tasks.enter', '同题对比 →') }}</span>
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
