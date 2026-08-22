<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { Announcement, DemoSummary } from '../api/types'
import DemoCard from '../components/DemoCard.vue'
import AnnouncementBlock from '../components/AnnouncementBlock.vue'
import MasonryGrid from '../components/MasonryGrid.vue'

const featured = ref<DemoSummary[]>([])
const featuredPool = ref<DemoSummary[]>([])
const featuredBusy = ref(false)
const grayTest = ref<DemoSummary[]>([])
const announcements = ref<Announcement[]>([])
const totalDemos = ref(0)
const totalTags = ref(0)
const loading = ref(true)
const error = ref('')

/** 原地 Fisher-Yates 洗牌，返回新数组 */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function loadFeatured() {
  // 首页精选整批随机（后端随机序缓存 60s）：拉 24 个做池，本地洗牌后取 6，
  // 保证「换一批」点击即时变化、且能从池里换入不同 demo（不依赖后端 60s 缓存过期）。
  const f = await api.listDemos({ status: 'approved', sort: 'random', page: 1, page_size: 24 })
  featuredPool.value = f.items
  featured.value = shuffle(f.items).slice(0, 6)
  totalDemos.value = f.total
}

async function shuffleFeatured() {
  if (featuredBusy.value) return
  if (!featuredPool.value.length) {
    featuredBusy.value = true
    try {
      await loadFeatured()
    } finally {
      featuredBusy.value = false
    }
    return
  }
  featuredBusy.value = true
  featured.value = shuffle(featuredPool.value).slice(0, 6)
  featuredBusy.value = false
}

// 灰测模型标签（mock/后端统一为 model:ds-unknown）
const GRAY_TAG = 'model:ds-unknown'
const grayTagUrl = computed(() => `/tag/model/ds-unknown`)

// 分组：项目公告 = 带 demo_slug（新发布 / 作品更新）；系统公告 = 无 demo_slug（手动 / 站点更新）
const projectAnnouncements = computed(() => announcements.value.filter((a) => a.demo_slug != null))
const systemAnnouncements = computed(() => announcements.value.filter((a) => a.demo_slug == null))

const annBottom = ref<HTMLElement | null>(null)
function scrollToAnnouncements() {
  annBottom.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const entries = [
  { to: '/demos', stamp: '逛', cls: 'lib', title: '作品库', desc: '搜索 · 筛选 · 全部作品' },
  { to: '/tags', stamp: '翻', cls: 'tags', title: '标签库', desc: '固定 / 开放 / 数字 三种维度' },
  { to: '/leaderboard', stamp: '榜', cls: 'rank', title: '排行榜', desc: '神作 / 鬼作 / 评分口碑榜' },
  { to: '/upload', stamp: '投', cls: 'upload', title: '投稿作品', desc: '上传你的 AI 网页 Demo' },
]

onMounted(async () => {
  try {
    const [g, a, keys] = await Promise.all([
      api.listDemos({ status: 'approved', tags: [GRAY_TAG], page: 1, page_size: 6 }),
      api.listAnnouncements(),
      api.listTagKeys(),
    ])
    grayTest.value = g.items
    totalTags.value = keys.reduce((n, k) => n + k.values.length, 0)
    announcements.value = a
    await loadFeatured()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">AI 网页 Demo 作品集</span>
    <RouterLink to="/about" class="home-title-link" :aria-label="`AI 全民制作人 · 关于本站`">
      <h1 class="huge">AI 全民<br />制作人</h1>
      <span class="home-title-hint">关于本站 →</span>
    </RouterLink>
    <p class="sub">
      这里收集由 AI 模型生成的网页 Demo —— 每个作品都附带生成会话日志与版本时间线，过程全透明。
      <a v-if="announcements.length" class="hero-ann-link" href="#" @click.prevent="scrollToAnnouncements">查看公告 →</a>
    </p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="tag-stat"><b>{{ totalDemos }}</b> Demo</span>
      <span class="tag-stat"><b>{{ totalTags }}</b> 标签值</span>
      <RouterLink class="btn btn-sm btn-primary" to="/upload">投稿 →</RouterLink>
    </div>
  </section>

  <!-- 入口大厅 -->
  <section class="section" style="padding-top: 8px">
    <div class="entry-grid">
      <RouterLink
        v-for="e in entries"
        :key="e.to"
        class="card card-default entry-card"
        :class="'entry-' + e.cls"
        :to="e.to"
      >
        <span class="entry-stamp">{{ e.stamp }}</span>
        <h2>{{ e.title }}</h2>
        <p class="muted">{{ e.desc }}</p>
        <span class="entry-arrow">进入 →</span>
      </RouterLink>
      <button class="card card-default entry-card entry-ann" type="button" @click="scrollToAnnouncements">
        <span class="entry-stamp">看</span>
        <h2>站点公告</h2>
        <p class="muted">项目公告 / 系统公告 · 最新动态</p>
        <span class="entry-arrow">查看 →</span>
      </button>
    </div>
  </section>

  <p class="muted" style="text-align: center; padding: 0 16px 8px">
    AI 自动上传：读取 <code>/api/v1/meta/agent-guide</code> 后即可发布
  </p>

  <!-- 精选展示 -->
  <section class="section" style="padding-top: 8px">
    <div class="section-head">
      <h2 class="section-title">精选作品</h2>
      <div class="filter-row" style="margin: 0">
        <button class="btn btn-sm btn-secondary" type="button" :disabled="featuredBusy" @click="shuffleFeatured">
          {{ featuredBusy ? '换一批…' : '换一批' }}
        </button>
        <RouterLink class="btn btn-sm btn-outline" to="/demos">查看全部 →</RouterLink>
      </div>
    </div>
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载精选…</div>
    <div v-else-if="!featured.length" class="empty-box">还没有 Demo，来投第一篇稿吧。</div>
    <MasonryGrid v-else :cols="3" :items="featured" :item-key="(d: unknown) => (d as DemoSummary).slug">
      <template #default="{ item }">
        <DemoCard :demo="item as DemoSummary" />
      </template>
    </MasonryGrid>
  </section>

  <!-- 灰测作品展示（网传灰测模型制作的 demo） -->
  <section v-if="grayTest.length" class="section" style="padding-top: 8px">
    <div class="section-head">
      <h2 class="section-title">
        灰测作品
        <span class="mode-badge mode-badge-int" style="margin-left: 10px">网传灰测</span>
      </h2>
      <RouterLink class="btn btn-sm btn-outline" :to="grayTagUrl">查看全部 →</RouterLink>
    </div>
    <p class="muted" style="margin: -12px 0 18px">
      以下 Demo 由网传灰测版模型生成。
    </p>
    <MasonryGrid :cols="3" :items="grayTest" :item-key="(d: unknown) => (d as DemoSummary).slug">
      <template #default="{ item }">
        <DemoCard :demo="item as DemoSummary" />
      </template>
    </MasonryGrid>
  </section>

  <!-- 公告沉底 -->
  <section v-if="announcements.length" ref="annBottom" class="section ann-blocks">
    <AnnouncementBlock v-if="projectAnnouncements.length" title="项目公告" :items="projectAnnouncements" />
    <AnnouncementBlock v-if="systemAnnouncements.length" title="系统公告" :items="systemAnnouncements" />
  </section>
</template>
