<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api'
import type { Announcement, DemoSummary, Tag } from '../api/types'
import DemoCard from '../components/DemoCard.vue'

const demos = ref<DemoSummary[]>([])
const announcements = ref<Announcement[]>([])
const allTags = ref<Tag[]>([])
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

const annTypeLabel: Record<string, string> = { manual: '公告', auto: '新发布', update: '更新' }

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
  // 不要先清空列表：清空会导致页面高度塌陷、滚动位置跳到顶部。
  // 保留旧列表直到新数据返回后再整体替换。
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
    allTags.value = await api.listTags()
  } catch {
    allTags.value = []
  }
  try {
    announcements.value = await api.listAnnouncements()
  } catch {
    announcements.value = []
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
    <span class="eyebrow">AI 网页 Demo 作品集</span>
    <h1 class="huge">民间科研<br />成果展示</h1>
    <p class="sub">
      这里收集由 AI 模型生成的网页 Demo —— 每个作品都附带生成会话日志与 Git 版本时间线，过程全透明。
    </p>
  </section>

  <section v-if="announcements.length" class="section" style="padding-top: 8px">
    <div class="section-head">
      <h2 class="section-title">公告</h2>
    </div>
    <div class="announce-list">
      <div v-for="a in announcements.slice(0, 5)" :key="a.id" class="announce-item">
        <span class="tag-chip" :class="{ active: true }">{{ annTypeLabel[a.type] || a.type }}</span>
        <div class="announce-body">
          <b>{{ a.title }}</b>
          <span v-if="a.demo_slug" class="muted"> · </span>
          <RouterLink v-if="a.demo_slug" :to="`/demo/${a.demo_slug}`" class="muted">{{ a.demo_slug }}</RouterLink>
          <p v-if="a.content" class="muted" style="margin: 4px 0 0">{{ a.content }}</p>
        </div>
        <span class="muted" style="white-space: nowrap">{{ new Date(a.created_at).toLocaleDateString('zh-CN') }}</span>
      </div>
    </div>
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

    <div v-if="allTags.length" class="filter-row">
      <button
        v-for="g in allTags.filter((t) => t.parent_id !== null || t.child_count === 0)"
        :key="g.key + ':' + g.value"
        class="tag-chip"
        :class="{ active: selectedTags.includes(g.key + ':' + g.value) }"
        type="button"
        @click="toggleTag(g.key + ':' + g.value)"
      >
        {{ g.key }}:{{ g.value }}
        <span class="count">{{ g.demo_count }}</span>
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
