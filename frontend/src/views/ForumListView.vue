<script setup lang="ts">
defineOptions({ name: 'ForumListView' })
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import type { ForumTopic } from '../api/types'

const route = useRoute()

const topics = ref<ForumTopic[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const q = ref('')
const category = ref('all')
const sort = ref<'newest' | 'popular'>('newest')
const loading = ref(false)
const error = ref('')

const categories = ['all', '交流', '分享', '求助', 'demo', '公告']

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.listForumTopics({
      q: q.value.trim() || undefined,
      category: category.value === 'all' ? undefined : category.value,
      sort: sort.value,
      page: page.value,
      page_size: pageSize,
    })
    topics.value = res.items
    total.value = res.total
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function apply() {
  page.value = 1
  load()
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

onMounted(() => {
  const sq = route.query.sort
  if (sq === 'popular') sort.value = 'popular'
  const sc = route.query.category
  if (typeof sc === 'string' && categories.includes(sc)) category.value = sc
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

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <div v-if="loading && !topics.length" class="loading-row"><span class="spinner"></span> 加载主题…</div>
    <div v-else-if="!topics.length" class="empty-box">暂无主题，来发第一帖吧</div>

    <div v-else class="forum-list">
      <RouterLink v-for="t in topics" :key="t.id" :to="`/forum/topic/${t.id}`" class="forum-topic-card">
        <div class="forum-topic-title">
          <span v-if="t.pinned" class="forum-badge forum-badge-pin">置顶</span>
          <span v-if="t.sticky" class="forum-badge forum-badge-sticky">加精</span>
          <span class="forum-cat">{{ t.category }}</span>
          {{ t.title }}
        </div>
        <div class="forum-topic-meta">
          <span>{{ t.author || '匿名' }}</span>
          <span class="forum-stat">回复 {{ t.reply_count }}</span>
          <span class="forum-stat">浏览 {{ t.view_count }}</span>
          <span>{{ timeAgo(t.created_at) }}</span>
        </div>
      </RouterLink>
    </div>

    <div v-if="topics.length" class="pager" style="justify-content: center">
      <button class="btn btn-sm btn-outline" type="button" :disabled="page <= 1" @click="page--; load()">上一页</button>
      <span class="tag-stat"><b>{{ page }}</b> / {{ Math.max(1, Math.ceil(total / pageSize)) }}</span>
      <button class="btn btn-sm btn-outline" type="button" :disabled="page * pageSize >= total" @click="page++; load()">下一页</button>
    </div>
  </section>
</template>
