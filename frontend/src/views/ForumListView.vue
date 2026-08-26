<script setup lang="ts">
defineOptions({ name: 'ForumListView' })
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import type { DemoDetail, ForumTopic } from '../api/types'
import PaginationBar from '../components/PaginationBar.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { timeAgo } from '../utils/time'
import { useListPage } from '../composables/useListPage'

const route = useRoute()
const router = useRouter()

const q = ref('')
const category = ref('all')
const sort = ref<'newest' | 'popular'>('newest')
const demoFilter = ref('')
const tagFilter = ref('')
const demoCards = ref<Record<string, DemoDetail | null>>({})

const categories = ['all', '交流', '分享', '求助', 'demo', '公告']

const { items: topics, total, page, pageSize, loading, error, load: baseLoad } = useListPage<ForumTopic>(
  async ({ page, page_size }) => {
    const res = await api.listForumTopics({
      q: q.value.trim() || undefined,
      category: category.value === 'all' ? undefined : category.value,
      demo: demoFilter.value || undefined,
      tag: tagFilter.value || undefined,
      sort: sort.value,
      page,
      page_size,
    })
    return { items: res.items, total: res.total }
  },
  20,
)

async function loadDemoChips() {
  const slugs = [...new Set(topics.value.map((t) => t.demo_slug).filter((s): s is string => !!s && !(s in demoCards.value)))]
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        demoCards.value[slug] = await api.getDemo(slug)
      } catch {
        demoCards.value[slug] = null
      }
    }),
  )
}

async function load() {
  await baseLoad()
  await loadDemoChips()
}

function apply() {
  page.value = 1
  load()
}

onMounted(() => {
  const sq = route.query.sort
  if (sq === 'popular') sort.value = 'popular'
  const sc = route.query.category
  if (typeof sc === 'string' && categories.includes(sc)) category.value = sc
  if (typeof route.query.demo === 'string') demoFilter.value = route.query.demo
  if (typeof route.query.tag === 'string') tagFilter.value = route.query.tag
  load()
})
</script>

<template>
  <section class="forum-hero">
    <div class="forum-hero-inner">
      <h1 class="forum-title">讨论区</h1>
      <p class="forum-sub">作品、提示词、技术交流——都在这里。</p>
      <RouterLink class="btn btn-primary" to="/forum/new">发帖 →</RouterLink>
    </div>
  </section>

  <section class="forum-section">
    <div class="forum-toolbar">
      <div class="search-box" style="flex: 1; max-width: 320px">
        <input v-model="q" class="input" type="search" placeholder="搜索主题…（回车提交）" @keyup.enter="apply" />
        <button class="btn btn-secondary search-submit" type="button" @click="apply">搜索</button>
      </div>
      <div class="filter-row" style="margin: 0">
        <button v-for="c in categories" :key="c" class="tag-chip" :class="{ active: category === c }" type="button" @click="category = c; apply()">{{ c === 'all' ? '全部' : c }}</button>
      </div>
      <div class="tabs" style="margin: 0">
        <button class="tab" :class="{ active: sort === 'newest' }" type="button" @click="sort = 'newest'; apply()">最新</button>
        <button class="tab" :class="{ active: sort === 'popular' }" type="button" @click="sort = 'popular'; apply()">热门</button>
      </div>
    </div>

    <div v-if="demoFilter || tagFilter" class="filter-row" style="margin-bottom: 8px">
      <span class="filter-label">筛选</span>
      <span class="tag-chip active">{{ demoFilter ? `作品：${demoFilter}` : `标签：${tagFilter}` }}</span>
      <button class="btn btn-sm btn-dark" type="button" @click="demoFilter = ''; tagFilter = ''; apply()">清除</button>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading && !topics.length" text="加载主题…" />
    <EmptyBox v-else-if="!topics.length" text="暂无主题，来发第一帖吧" />

    <div v-else class="forum-list">
      <RouterLink v-for="t in topics" :key="t.id" :to="`/forum/topic/${t.id}`" class="forum-topic-card">
        <div class="forum-topic-title">
          <span v-if="t.pinned" class="forum-badge forum-badge-pin">置顶</span>
          <span v-if="t.sticky" class="forum-badge forum-badge-sticky">加精</span>
          <span class="forum-cat">{{ t.category }}</span>
          {{ t.title }}
        </div>
        <div v-if="t.demo_slug" class="forum-topic-demo">
          <span class="forum-demo-chip" role="link" @click.stop.prevent="router.push(`/demo/${t.demo_slug}`)">
            <img v-if="demoCards[t.demo_slug]" class="forum-demo-chip-cover" :src="demoCards[t.demo_slug]?.cover_url" alt="" loading="lazy" />
            <span>{{ demoCards[t.demo_slug]?.title || t.demo_slug }}</span>
          </span>
        </div>
        <div class="forum-topic-meta">
          <span>{{ t.author || '匿名' }}</span>
          <span class="forum-stat">回复 {{ t.reply_count }}</span>
          <span class="forum-stat">浏览 {{ t.view_count }}</span>
          <span>{{ timeAgo(t.created_at) }}</span>
        </div>
      </RouterLink>
    </div>

    <PaginationBar v-if="topics.length" :page="page" :total="total" :page-size="pageSize" @change="(p) => { page = p; load() }" />
  </section>
</template>
