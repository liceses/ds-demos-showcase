<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api'
import type { Announcement, DemoSummary, Tag } from '../api/types'
import DemoCard from '../components/DemoCard.vue'
import AnnouncementBlock from '../components/AnnouncementBlock.vue'

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

// 分组：项目公告 = 带 demo_slug（新发布 / 作品更新）；系统公告 = 无 demo_slug（手动 / 站点更新）
const projectAnnouncements = computed(() => announcements.value.filter((a) => a.demo_slug != null))
const systemAnnouncements = computed(() => announcements.value.filter((a) => a.demo_slug == null))

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

  <section v-if="announcements.length" class="section ann-blocks">
    <AnnouncementBlock v-if="projectAnnouncements.length" title="项目公告" :items="projectAnnouncements" />
    <AnnouncementBlock v-if="systemAnnouncements.length" title="系统公告" :items="systemAnnouncements" />
  </section>
</template>
