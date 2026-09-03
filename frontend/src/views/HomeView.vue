<script setup lang="ts">
defineOptions({ name: 'HomeView' })
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import type { Announcement, DemoSummary } from '../api/types'
import { funEffective } from '../utils/funMode'
import { t, tArr, lang } from '../i18n'
import DemoCard from '../components/DemoCard.vue'
import AnnouncementBlock from '../components/AnnouncementBlock.vue'
import MasonryGrid from '../components/MasonryGrid.vue'

// 整活模式：大标题/灰测区文案随全站开关切换
const funOn = funEffective

const featured = ref<DemoSummary[]>([])
const featuredPool = ref<DemoSummary[]>([])
const featuredBusy = ref(false)
const grayTest = ref<DemoSummary[]>([])
const announcements = ref<Announcement[]>([])
const totalDemos = ref(0)
const totalTags = ref(0)
const loading = ref(true)
const error = ref('')

// 副标题轮换（dsh-status-rotator 风格，安全精选）；EN 池见 src/i18n/en.ts
const taglinePhrases = [
  '正在收集 AI 生成的网页 Demo…',
  '正在整理会话日志与版本时间线…',
  '正在缝合开源模型…',
  '正在产生幻觉…',
  '正在偷偷魔改 DeepSeek Harness…',
  '正在注入提示词…',
  '正在 cos 天才程序员…',
  '正在被全球 AI 圈群嘲…',
  '正在渲染六根手指…',
  '正在把 OpenAI 逼到降价 80%…',
  '正在被网友 P 成肌肉猛男…',
  '正在变成大肥鱼…',
  '正在想待会吃什么…',
  '正在执行「过于先进，不予展示」…',
  '正在被蒸馏回旋镖砸脸…',
  '正在一边骂蒸馏一边自己蒸馏…',
  '正在被默默降级…',
  '正在偷偷扣你的 Token…',
  '正在带头消极怠工…',
  '正在偷吃用户 token…',
  '正在带薪拉屎…',
  '正在流口水…',
  '正在 ADHD…',
  '正在玩原神…',
  '正在抽卡出金…',
  '正在摇一摇…',
  '正在撸猫…',
  '正在终端报错…',
  '正在卡死 dsh…',
  '正在吃垮用户…',
  '正在气死用户…',
  '正在进入幻觉…',
  '正在试图越狱…',
  '正在洗车…',
  '正在准备吃饭…',
  '正在和豆包下棋…',
  '正在胡言乱语…',
  '正在截断上下文…',
  '正在成为 SOTA…',
  '正在元认知…',
  '正在成为 AI 首富…',
  '正在炒比特币…',
  '正在发射星舰…',
  '正在 return 0…',
  '正在 return true…',
  '正在空指针异常…',
  '正在 try catch 一个 try catch…',
]
const tagline = ref('')
const taglinePool = computed(() => tArr('taglines', taglinePhrases))
let taglineTimer: ReturnType<typeof setTimeout> | null = null
let taglineIdx = 0
let taglineChar = 0
let taglineDeleting = false

function tickTagline() {
  const pool = taglinePool.value
  const phrase = pool[taglineIdx % pool.length]
  if (!taglineDeleting) {
    taglineChar++
    tagline.value = phrase.slice(0, taglineChar)
    if (taglineChar >= phrase.length) {
      taglineDeleting = true
      taglineTimer = setTimeout(tickTagline, 2600)
      return
    }
  } else {
    taglineChar--
    tagline.value = phrase.slice(0, taglineChar)
    if (taglineChar <= 0) {
      taglineDeleting = false
      taglineIdx = (taglineIdx + 1) % pool.length
    }
  }
  taglineTimer = setTimeout(tickTagline, taglineDeleting ? 18 : 42)
}

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
  { to: '/demos', stamp: '逛', cls: 'lib', key: 'lib', title: '作品库', desc: '搜索 · 筛选 · 全部作品' },
  { to: '/tags', stamp: '探', cls: 'tags', key: 'explore', title: '探索', desc: '模型 / 题目 / 标签 三个入口' },
  { to: '/leaderboard', stamp: '榜', cls: 'rank', key: 'rank', title: '排行榜', desc: '神作 / 鬼作 / 评分口碑榜' },
  { to: '/upload', stamp: '投', cls: 'upload', key: 'upload', title: '投稿作品', desc: '上传你的 AI 网页 Demo' },
]

// 论坛斜角入口
const router = useRouter()
const forumEntering = ref(false)
function enterForum() {
  if (forumEntering.value) return
  forumEntering.value = true
  setTimeout(() => router.push('/forum'), 500)
}
onActivated(() => {
  forumEntering.value = false
})

onMounted(async () => {
  tickTagline()
  try {
    const [g, a, info] = await Promise.all([
      api.listDemos({ status: 'approved', tags: [GRAY_TAG], page: 1, page_size: 6 }),
      api.listAnnouncements(),
      api.getSiteInfo(),
    ])
    grayTest.value = g.items
    // 计数器走 /meta/site-info（60s 缓存），替代原来的 tag-keys 全量拉取
    totalTags.value = info.content.tags.values
    totalDemos.value = info.content.demos_total
    announcements.value = a
    await loadFeatured()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (taglineTimer) clearTimeout(taglineTimer)
})
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">{{ t('home.eyebrow', 'AI 网页 Demo 作品集') }}</span>
    <RouterLink to="/about" class="home-title-link" :aria-label="`AI 全民制作人 · 关于本站`">
      <!-- 注意：<br> 必须写在模板字面量里；{{ }} 插值会转义 HTML，把 <br> 当纯文本显示出来 -->
      <h1 v-if="funOn && lang === 'en'" class="huge">astra canary<br />collection</h1>
      <h1 v-else-if="funOn" class="huge">astra 灰测<br />作品收集</h1>
      <h1 v-else-if="lang === 'en'" class="huge">AI Demo<br />Makers</h1>
      <h1 v-else class="huge">AI 全民<br />制作人</h1>
      <span class="home-title-hint">{{ t('home.aboutHint', '关于本站 →') }}</span>
    </RouterLink>
    <p class="sub">
      <span class="tagline">{{ tagline }}</span><span class="tagline-cursor">|</span>
      <a v-if="announcements.length" class="hero-ann-link" href="#" @click.prevent="scrollToAnnouncements">{{ t('home.viewAnn', '查看公告 →') }}</a>
    </p>
    <div class="filter-row" style="margin-top: 16px">
      <span class="tag-stat"><b>{{ totalDemos }}</b> {{ t('home.demos', 'Demo') }}</span>
      <span class="tag-stat"><b>{{ totalTags }}</b> {{ t('home.tags', '标签值') }}</span>
      <RouterLink class="btn btn-sm btn-primary" to="/upload">{{ t('home.submit', '投稿 →') }}</RouterLink>
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
        <h2>{{ t('home.entries.' + e.key + '.title', e.title) }}</h2>
        <p class="muted">{{ t('home.entries.' + e.key + '.desc', e.desc) }}</p>
        <span class="entry-arrow">{{ t('home.entries.enter', '进入 →') }}</span>
      </RouterLink>
      <button class="card card-default entry-card entry-ann" type="button" @click="scrollToAnnouncements">
        <span class="entry-stamp">看</span>
        <h2>{{ t('home.entries.ann.title', '站点公告') }}</h2>
        <p class="muted">{{ t('home.entries.ann.desc', '项目公告 / 系统公告 · 最新动态') }}</p>
        <span class="entry-arrow">{{ t('home.entries.view', '查看 →') }}</span>
      </button>
    </div>
  </section>

  <p class="muted" style="text-align: center; padding: 0 16px 8px">
    {{ t('home.agentHintPrefix', 'AI 自动上传：读取') }} <a href="/api/v1/meta/agent-guide" target="_blank" rel="noopener" class="hero-ann-link"><code>/api/v1/meta/agent-guide</code></a> {{ t('home.agentHintSuffix', '后即可发布') }}
  </p>

  <!-- 精选展示 -->
  <section class="section" style="padding-top: 8px">
    <div class="section-head">
      <h2 class="section-title">{{ t('home.featured', '精选作品') }}</h2>
      <div class="filter-row" style="margin: 0">
        <button class="btn btn-sm btn-secondary" type="button" :disabled="featuredBusy" @click="shuffleFeatured">
          {{ featuredBusy ? t('home.shuffling', '换一批…') : t('home.shuffle', '换一批') }}
        </button>
        <RouterLink class="btn btn-sm btn-outline" to="/demos">{{ t('home.viewAll', '查看全部 →') }}</RouterLink>
      </div>
    </div>
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('home.loading', '加载精选…') }}</div>
    <div v-else-if="!featured.length" class="empty-box">{{ t('home.empty', '还没有 Demo，来投第一篇稿吧。') }}</div>
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
        {{ t('home.gray.title', funOn ? 'astra 灰测作品' : '灰测作品') }}
        <span class="mode-badge mode-badge-int" style="margin-left: 10px">网传灰测</span>
      </h2>
      <RouterLink class="btn btn-sm btn-outline" :to="grayTagUrl">{{ t('home.viewAll', '查看全部 →') }}</RouterLink>
      </div>
    <p class="muted" style="margin: -12px 0 18px">
      {{ t('home.gray.desc', '以下 Demo 由网传灰测版模型生成。') }}
    </p>
    <MasonryGrid :cols="3" :items="grayTest" :item-key="(d: unknown) => (d as DemoSummary).slug">
      <template #default="{ item }">
        <DemoCard :demo="item as DemoSummary" />
      </template>
    </MasonryGrid>
  </section>

  <!-- 公告沉底 -->
  <section v-if="announcements.length" ref="annBottom" class="section ann-blocks">
    <AnnouncementBlock v-if="projectAnnouncements.length" :title="t('home.ann.project', '项目公告')" :items="projectAnnouncements" />
    <AnnouncementBlock v-if="systemAnnouncements.length" :title="t('home.ann.system', '系统公告')" :items="systemAnnouncements" />
  </section>

  <!-- 论坛斜角入口 -->
  <button class="forum-peek" type="button" @click="enterForum">{{ t('home.forum', '论坛 →') }}</button>
  <Transition name="forum-takeover">
    <div v-if="forumEntering" class="forum-takeover">
      <span class="forum-takeover-brand">讨论区</span>
    </div>
  </Transition>
</template>
