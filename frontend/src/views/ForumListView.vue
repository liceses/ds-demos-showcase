<script setup lang="ts">
defineOptions({ name: 'ForumListView' })
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import type { DemoDetail, ForumTopic } from '../api/types'
import PaginationBar from '../components/PaginationBar.vue'
import LoadingRow from '../components/LoadingRow.vue'
import EmptyBox from '../components/EmptyBox.vue'
import { timeAgo } from '../utils/time'
import { useListPage } from '../composables/useListPage'
import { t, forumCatLabel } from '../i18n'

const route = useRoute()
const router = useRouter()

const q = ref('')
const category = ref('all')
const scope = ref<'general' | 'demo'>('general')
const sort = ref<'newest' | 'popular' | 'replies' | 'hot'>('newest')
const demoFilter = ref('')
const tagFilter = ref('')
const stickyFilter = ref(false)
const participatedFilter = ref(false)
const followedFilter = ref(false)
const demoCards = ref<Record<string, DemoDetail | null>>({})
const hotTopics = ref<ForumTopic[]>([])
const sideOpen = ref(true)

const categories = ['all', '交流', '分享', '求助', 'demo', '公告']

const { items: topics, total, page, pageSize, loading, error, load: baseLoad } = useListPage<ForumTopic>(
  async ({ page, page_size }) => {
    const res = await api.listForumTopics({
      q: q.value.trim() || undefined,
      category: scope.value === 'demo' ? undefined : (category.value === 'all' ? undefined : category.value),
      kind: scope.value,
      demo: demoFilter.value || undefined,
      tag: tagFilter.value || undefined,
      sort: sort.value,
      sticky: stickyFilter.value || undefined,
      participated: participatedFilter.value || undefined,
      followed: followedFilter.value || undefined,
      page,
      page_size,
    })
    return { items: res.items, total: res.total }
  },
  20,
)

const activeUsers = computed(() => {
  const map = new Map<string, number>()
  for (const t of topics.value) {
    const name = t.author || '匿名'
    map.set(name, (map.get(name) || 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name)
})

function avatarClass(name: string) {
  const n = (name.charCodeAt(0) || 0) % 4
  return `avatar-${n + 1}`
}

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
  if (sq === 'replies') sort.value = 'replies'
  if (sq === 'hot') sort.value = 'hot'
  const sc = route.query.category
  if (typeof sc === 'string' && categories.includes(sc)) category.value = sc
  if (typeof route.query.demo === 'string') demoFilter.value = route.query.demo
  if (typeof route.query.tag === 'string') tagFilter.value = route.query.tag
  if (route.query.sticky === '1') stickyFilter.value = true
  if (route.query.participated === '1') participatedFilter.value = true
  if (route.query.followed === '1') followedFilter.value = true
  if (route.query.scope === 'demo') scope.value = 'demo'
  if (route.query.scope === 'general') scope.value = 'general'
  load()
  api.listForumTopics({ sort: 'hot', page_size: 5 }).then((r) => (hotTopics.value = r.items)).catch(() => (hotTopics.value = []))
})
</script>

<template>
  <section class="forum-hero">
    <div class="forum-hero-inner">
      <h1 class="forum-title">{{ t('forum.title', '讨论区') }}</h1>
      <p class="forum-sub">{{ t('forum.sub', '作品、提示词、技术交流——都在这里。') }}</p>
      <RouterLink class="btn btn-primary" to="/forum/new">{{ t('forum.newPost', '发帖 →') }}</RouterLink>
    </div>
  </section>

  <section class="forum-section">
    <div class="forum-toolbar">
      <div class="search-box" style="flex: 1; max-width: 320px">
        <input v-model="q" class="input" type="search" :placeholder="t('forum.searchPlaceholder', '搜索主题…（回车提交）')" @keyup.enter="apply" />
        <button class="btn btn-secondary search-submit" type="button" @click="apply">{{ t('demos.search', '搜索') }}</button>
      </div>
      <div class="tabs" style="margin: 0">
        <button class="tab" :class="{ active: scope === 'general' }" type="button" @click="scope = 'general'; apply()">{{ t('forum.scopeGeneral', '综合') }}</button>
        <button class="tab" :class="{ active: scope === 'demo' }" type="button" @click="scope = 'demo'; apply()">{{ t('forum.scopeDemo', '作品讨论') }}</button>
      </div>
      <div class="tabs" style="margin: 0">
        <button class="tab" :class="{ active: sort === 'newest' }" type="button" @click="sort = 'newest'; apply()">{{ t('demos.newest', '最新') }}</button>
        <button class="tab" :class="{ active: sort === 'popular' }" type="button" @click="sort = 'popular'; apply()">{{ t('demos.hot', '热门') }}</button>
        <button class="tab" :class="{ active: sort === 'replies' }" type="button" @click="sort = 'replies'; apply()">{{ t('forum.sortReplies', '回复') }}</button>
        <button class="tab" :class="{ active: sort === 'hot' }" type="button" @click="sort = 'hot'; apply()">{{ t('forum.sortHeat', '热度') }}</button>
        <button class="btn btn-sm btn-outline" type="button" @click="sideOpen = !sideOpen">{{ sideOpen ? t('forum.hideSide', '收起侧栏') : t('forum.showSide', '展开侧栏') }}</button>
      </div>
    </div>

    <div class="filter-row" style="margin-bottom: 12px">
      <button class="tag-chip" :class="{ active: stickyFilter }" type="button" @click="stickyFilter = !stickyFilter; apply()">{{ t('forum.onlySticky', '只看精华') }}</button>
      <button class="tag-chip" :class="{ active: participatedFilter }" type="button" @click="participatedFilter = !participatedFilter; apply()">{{ t('forum.mine', '我参与的') }}</button>
      <button class="tag-chip" :class="{ active: followedFilter }" type="button" @click="followedFilter = !followedFilter; apply()">{{ t('forum.followed', '我关注的') }}</button>
    </div>

    <div v-if="demoFilter || tagFilter" class="filter-row" style="margin-bottom: 8px">
      <span class="filter-label">{{ t('forum.filter', '筛选') }}</span>
      <span class="tag-chip active">{{ demoFilter ? t('forum.demoFilter', '作品：{v}', { v: demoFilter }) : t('forum.tagFilter', '标签：{v}', { v: tagFilter }) }}</span>
      <button class="btn btn-sm btn-dark" type="button" @click="demoFilter = ''; tagFilter = ''; apply()">{{ t('demos.clearRange', '清除') }}</button>
    </div>

    <div class="forum-layout">
      <div class="forum-main">
        <div v-if="error" class="notice notice-error">{{ error }}</div>
        <LoadingRow v-if="loading && !topics.length" :text="t('forum.loading', '加载主题…')" />
        <EmptyBox v-else-if="!topics.length" :text="t('forum.empty', '暂无主题，来发第一帖吧')" />

        <div v-else class="forum-list">
          <RouterLink v-for="t2 in topics" :key="t2.id" :to="`/forum/topic/${t2.id}`" class="forum-topic-card">
            <span class="forum-avatar" :class="avatarClass(t2.author || t('forum.anon', '匿名'))">{{ (t2.author || t('forum.anon', '匿名'))[0] }}</span>
            <div class="forum-topic-body">
              <div class="forum-topic-title">
                <span v-if="t2.pinned" class="forum-badge forum-badge-pin">{{ t('forum.pinned', '置顶') }}</span>
                <span v-if="t2.sticky" class="forum-badge forum-badge-sticky">{{ t('forum.sticky', '加精') }}</span>
                <span v-if="t2.solved" class="forum-badge" style="background: var(--mint)">{{ t('forum.solved', '已解决') }}</span>
                <span v-if="t2.locked" class="forum-badge" style="background: var(--ink); color: var(--paper)">{{ t('forum.locked', '已关闭') }}</span>
                <span class="forum-cat">{{ forumCatLabel(t2.category) }}</span>
                {{ t2.title }}
              </div>
              <div v-if="t2.demo_slug" class="forum-topic-demo">
                <span class="forum-demo-chip" role="link" @click.stop.prevent="router.push(`/demo/${t2.demo_slug}`)">
                  <img v-if="demoCards[t2.demo_slug]" class="forum-demo-chip-cover" :src="demoCards[t2.demo_slug]?.cover_url" alt="" loading="lazy" />
                  <span>{{ demoCards[t2.demo_slug]?.title || t2.demo_slug }}</span>
                </span>
              </div>
              <div class="forum-topic-meta">
                <span>{{ t2.author || t('forum.anon', '匿名') }}</span>
                <span class="forum-stat">{{ t('forum.replies', '回复 {n}', { n: t2.reply_count }) }}</span>
                <span class="forum-stat">{{ t('forum.views', '浏览 {n}', { n: t2.view_count }) }}</span>
                <span class="forum-stat">{{ t('forum.likes', '赞 {n}', { n: t2.like_count }) }}</span>
                <span>{{ timeAgo(t2.created_at) }}</span>
              </div>
            </div>
            <span class="forum-reply-badge">{{ t2.reply_count }}</span>
          </RouterLink>
        </div>

        <PaginationBar v-if="topics.length" :page="page" :total="total" :page-size="pageSize" @change="(p) => { page = p; load() }" />
      </div>

      <aside v-if="sideOpen" class="forum-side">
        <div class="forum-side-card">
          <RouterLink class="btn btn-primary btn-block" to="/forum/new">{{ t('forum.newPost', '发帖 →') }}</RouterLink>
        </div>

        <div class="forum-side-card">
          <h3 class="forum-side-title">{{ t('forum.categories', '分类') }}</h3>
          <div class="forum-side-list">
            <button
              v-for="c in categories"
              :key="c"
              class="forum-side-item"
              :class="{ active: category === c }"
              type="button"
              @click="category = c; apply()"
            >{{ c === 'all' ? t('tags.all', '全部') : forumCatLabel(c) }}</button>
          </div>
        </div>

        <div class="forum-side-card">
          <h3 class="forum-side-title">{{ t('forum.hotTopics', '热门话题') }}</h3>
          <div class="forum-side-list">
            <RouterLink v-for="t3 in hotTopics.slice(0, 5)" :key="t3.id" class="forum-side-item" :to="`/forum/topic/${t3.id}`">
              <span class="forum-side-item-title">{{ t3.title }}</span>
              <span class="forum-stat">{{ t3.reply_count }}</span>
            </RouterLink>
            <div v-if="!hotTopics.length" class="muted">{{ t('forum.none', '暂无') }}</div>
          </div>
        </div>

        <div class="forum-side-card">
          <h3 class="forum-side-title">{{ t('forum.activeUsers', '活跃用户') }}</h3>
          <div class="forum-side-list">
            <RouterLink v-for="name in activeUsers" :key="name" class="forum-side-item" :to="`/user/${name}`">
              <span class="forum-avatar avatar-sm" :class="avatarClass(name)">{{ name[0] }}</span>
              <span>{{ name }}</span>
            </RouterLink>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
