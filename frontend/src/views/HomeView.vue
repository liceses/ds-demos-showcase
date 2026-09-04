<script setup lang="ts">
defineOptions({ name: 'HomeView' })
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { api } from '../api'
import type { Announcement, DemoSummary, ForumTopic, LiveStats, SiteInfo, UserLeaderboardItem } from '../api/types'
import { funEffective } from '../utils/funMode'
import { annUnreadCount, markAnnouncementsRead } from '../utils/announcement'
import { t, tArr, lang } from '../i18n'
import { useAuthStore } from '../stores/auth'
import { useQueues } from '../composables/adminQueues'
import { timeAgo } from '../utils/time'
import DemoCard from '../components/DemoCard.vue'
import AnnouncementBlock from '../components/AnnouncementBlock.vue'
import MasonryGrid from '../components/MasonryGrid.vue'

// 整活模式：大标题/灰测区文案随全站开关切换
const funOn = funEffective
const auth = useAuthStore()

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
    const j = Math.floor(Math.random() * a.length)
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
// 灰测专区折叠条（03 §3.2：默认收起，折叠时不加载卡片图）
const grayOpen = ref(false)

// 分组：项目公告 = 带 demo_slug（新发布 / 作品更新）；系统公告 = 无 demo_slug（手动 / 站点更新）
const projectAnnouncements = computed(() => announcements.value.filter((a) => a.demo_slug != null))
const systemAnnouncements = computed(() => announcements.value.filter((a) => a.demo_slug == null))

// 公告未读徽章（M1-2 侧栏）：水位线机制见 utils/announcement；tick 驱动响应式重算
const annReadTick = ref(0)
const annUnread = computed(() => {
  void annReadTick.value
  return annUnreadCount(announcements.value)
})
function onAnnOpened() {
  markAnnouncementsRead(announcements.value)
  annReadTick.value++
}

// 公告入口锚点（hero「查看公告→」与入口胶囊「看公告」都滚到侧栏公告卡）
const annSide = ref<HTMLElement | null>(null)
function scrollToAnnouncements() {
  annSide.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const entries = [
  { to: '/demos', stamp: '逛', cls: 'lib', key: 'lib', title: '作品库', desc: '搜索 · 筛选 · 全部作品' },
  { to: '/tags', stamp: '探', cls: 'tags', key: 'explore', title: '探索', desc: '模型 / 题目 / 标签 三个入口' },
  { to: '/leaderboard', stamp: '榜', cls: 'rank', key: 'rank', title: '排行榜', desc: '神作 / 鬼作 / 评分口碑榜' },
  { to: '/upload', stamp: '投', cls: 'upload', key: 'upload', title: '投稿作品', desc: '上传你的 AI 网页 Demo' },
]

// M0-D 入口胶囊实时数字：数据源 = 既有 getSiteInfo（60s 缓存，零新增请求）；
// 计数缺失时隐藏数字不占位（排行榜无现成计数 → 恒隐藏）
const content = ref<SiteInfo['content'] | null>(null)
const entryCounts = computed<Record<string, number | null>>(() => ({
  lib: content.value ? content.value.demos_total : null,
  explore: content.value ? content.value.tags.values : null,
  rank: null,
  upload: content.value ? content.value.uploads_last_7d : null,
}))
function countLabel(key: string, n: number): string {
  if (key === 'lib') return t('home.count.demos', '{n} 件作品', { n })
  if (key === 'explore') return t('home.count.tagValues', '{n} 标签值', { n })
  if (key === 'upload') return t('home.count.uploads7d', '近 7 天 {n}', { n })
  return String(n)
}
// 数字槽稳定性：content 未到位时胶囊先渲染（占位「···」），到位后填数——
// 槽位恒渲染 + min-width，消除 site-info 返回瞬间的胶囊宽度跳变（CLS）；
// 失败路径同样保持槽位（空槽），宽度全程不变。rank 恒无计数 → 连槽位一起隐藏。
const contentLoaded = ref(false)

// ---- 侧栏数据源（全部既有接口，零后端改动）----
// 论坛热帖 Top3：GET /forum/topics?sort=hot
const hotTopics = ref<ForumTopic[]>([])
// 榜单速览：神作 Top5（GET /leaderboard?sort=god）+ 声望 Top5（GET /users/leaderboard?sort=reputation）
const godTop = ref<DemoSummary[]>([])
const repTop = ref<UserLeaderboardItem[]>([])
// 实时在线：GET /stats/live，10s 轮询（照 AboutView 模式；本页在 KeepAlive 里，
// 用 onActivated/onDeactivated 起停定时器，页面切走不空转）
const live = ref<LiveStats | null>(null)
let liveTimer: ReturnType<typeof setInterval> | null = null
async function loadLive() {
  try {
    live.value = await api.getLiveStats()
  } catch {
    /* 实时失败静默（照 About 口径） */
  }
}
function startLiveTimer() {
  if (!liveTimer) liveTimer = setInterval(loadLive, 10_000)
}
function stopLiveTimer() {
  if (liveTimer) {
    clearInterval(liveTimer)
    liveTimer = null
  }
}

// 最新上传（续流，加载更多）：sort=newest 分页追加
const latest = ref<DemoSummary[]>([])
const latestTotal = ref(0)
const latestPage = ref(0)
const latestBusy = ref(false)
async function loadMoreLatest() {
  if (latestBusy.value) return
  latestBusy.value = true
  try {
    const r = await api.listDemos({ status: 'approved', sort: 'newest', page: latestPage.value + 1, page_size: 6 })
    latest.value = latest.value.concat(r.items)
    latestTotal.value = r.total
    latestPage.value += 1
  } catch {
    /* 续流失败静默（下一页再试） */
  } finally {
    latestBusy.value = false
  }
}

// 管理员过渡速览卡（03 §2.4：M0 一次性过渡件，M2 移除）：
// 计数读取 adminQueues 单一口径（App 壳层已对管理员触发 refresh，这里只读不重复拉）
const { queues, totalMust } = useQueues()

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
    content.value = info.content
    totalTags.value = info.content.tags.values
    totalDemos.value = info.content.demos_total
    announcements.value = a
    await loadFeatured()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
    contentLoaded.value = true
  }
  // 侧栏三路轻量并发（热帖/双榜）；失败静默——侧栏是增强不是关键路径
  api
    .listForumTopics({ sort: 'hot', page_size: 3 })
    .then((r) => (hotTopics.value = r.items))
    .catch(() => undefined)
  api
    .getLeaderboard('god', 1, 5)
    .then((r) => (godTop.value = r.items))
    .catch(() => undefined)
  api
    .userLeaderboard('reputation', 1, 5)
    .then((r) => (repTop.value = r.items))
    .catch(() => undefined)
  await loadMoreLatest()
  await loadLive()
  startLiveTimer()
})
// KeepAlive 语义：离开本页停轮询（不空转），回来续上
onActivated(() => {
  startLiveTimer()
})
onDeactivated(() => {
  stopLiveTimer()
})
onBeforeUnmount(() => {
  stopLiveTimer()
  if (taglineTimer) clearTimeout(taglineTimer)
})
</script>

<template>
  <div class="route-page">  <section class="page-hero">
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

  <!-- M0-D 入口大厅改胶囊行（03 §3.2：入口卡降为胶囊，老用户不再被反复教导航）；
       实时数字来自 site-info（缺失即隐藏不占位）；样式组件级（全局 style.css 冻结） -->
  <section class="section" style="padding-top: 8px">
    <div class="entry-caps-row">
      <RouterLink v-for="e in entries" :key="e.to" class="entry-capsule" :to="e.to">
        <span class="entry-capsule-stamp" aria-hidden="true">{{ e.stamp }}</span>
        <span class="entry-capsule-title">{{ t('home.entries.' + e.key + '.title', e.title) }}</span>
        <!-- M0 验收修复：数字槽恒渲染（rank 除外）——占位「···」+ 固定 min-width，
             消除 site-info 到位瞬间的胶囊宽度跳变（CLS）；失败路径槽位保持空、宽度不变 -->
        <span v-if="e.key !== 'rank'" class="entry-capsule-count" :class="{ pending: entryCounts[e.key] == null }">
          <template v-if="entryCounts[e.key] != null">{{ countLabel(e.key, entryCounts[e.key] as number) }}</template>
          <template v-else-if="!contentLoaded">···</template>
        </span>
      </RouterLink>
      <button class="entry-capsule" type="button" @click="scrollToAnnouncements">
        <span class="entry-capsule-stamp" aria-hidden="true">看</span>
        <span class="entry-capsule-title">{{ t('home.entries.ann.title', '站点公告') }}</span>
      </button>
    </div>
  </section>

  <p class="muted" style="text-align: center; padding: 0 16px 8px">
    {{ t('home.agentHintPrefix', 'AI 自动上传：读取') }} <a href="/api/v1/meta/agent-guide" target="_blank" rel="noopener" class="hero-ann-link"><code>/api/v1/meta/agent-guide</code></a> {{ t('home.agentHintSuffix', '后即可发布') }}
  </p>

  <!-- M1-2 首页枢纽（03 §3.2）：主列 2/3 + 侧栏 1/3（sticky）；
       回访者 10 秒看到：新东西（精选/续流）、社区在聊什么（热帖）、可信度信号（榜单/在线/公告） -->
  <div class="hub-grid">
    <div class="hub-main">
      <!-- 精选展示 -->
      <section class="section hub-block" style="padding-top: 0">
        <div class="section-head">
          <h2 class="section-title">{{ t('home.featured', '精选作品') }}</h2>
          <div class="filter-row" style="margin: 0">
            <button class="btn btn-sm btn-secondary" type="button" :disabled="featuredBusy" @click="shuffleFeatured">
              {{ featuredBusy ? t('home.shuffling', '换一批…') : t('home.shuffle', '换一批') }}
            </button>
            <RouterLink class="btn btn-sm btn-outline" to="/demos">{{ t('home.viewAll', '查看全部 →') }}</RouterLink>
          </div>
        </div>
        <!-- 换池口径说明行（03 §3.2 策展透明）：写后端真实口径（demos.py _random_ids=已上架全量随机，60s 缓存同批），不写理想口径 -->
        <p class="muted caliber-line">{{ t('home.shuffleCaliber', '换池口径：已上架作品全量随机，60 秒内同一批') }}</p>
        <div v-if="error" class="notice notice-error">{{ error }}</div>
        <div v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('home.loading', '加载精选…') }}</div>
        <div v-else-if="!featured.length" class="empty-box">{{ t('home.empty', '还没有 Demo，来投第一篇稿吧。') }}</div>
        <MasonryGrid v-else :cols="3" :items="featured" :item-key="(d: unknown) => (d as DemoSummary).slug">
          <template #default="{ item }">
            <DemoCard :demo="item as DemoSummary" />
          </template>
        </MasonryGrid>
      </section>

      <!-- 灰测专区：折叠条（默认收起，折叠时不加载卡片图） -->
      <section v-if="grayTest.length" class="section hub-block">
        <button class="gray-fold" type="button" :aria-expanded="grayOpen" @click="grayOpen = !grayOpen">
          <span class="gray-fold-title">{{ t('home.gray.title', funOn ? 'astra 灰测作品' : '灰测作品') }}</span>
          <span class="mode-badge mode-badge-int">{{ t('home.gray.badge', '网传灰测') }} · {{ grayTest.length }}</span>
          <span class="gray-fold-caret" :class="{ open: grayOpen }" aria-hidden="true">▾</span>
        </button>
        <template v-if="grayOpen">
          <p class="muted" style="margin: 10px 0 16px">
            {{ t('home.gray.desc', '以下 Demo 由网传灰测版模型生成。') }}
          </p>
          <MasonryGrid :cols="3" :items="grayTest" :item-key="(d: unknown) => (d as DemoSummary).slug">
            <template #default="{ item }">
              <DemoCard :demo="item as DemoSummary" />
            </template>
          </MasonryGrid>
          <RouterLink class="btn btn-sm btn-outline" style="margin-top: 12px" :to="grayTagUrl">{{ t('home.viewAll', '查看全部 →') }}</RouterLink>
        </template>
      </section>

      <!-- 最新上传（续流，加载更多） -->
      <section class="section hub-block">
        <div class="section-head">
          <h2 class="section-title">{{ t('home.latest.title', '最新上传') }}</h2>
        </div>
        <div v-if="!latest.length && latestBusy" class="loading-row"><span class="spinner"></span> {{ t('home.latest.loading', '加载最新…') }}</div>
        <div v-else-if="!latest.length" class="empty-box">{{ t('home.latest.empty', '还没有新上传') }}</div>
        <div v-else class="latest-list">
          <RouterLink v-for="d in latest" :key="d.slug" class="latest-row" :to="`/demo/${d.slug}`">
            <span class="latest-title">{{ d.title }}</span>
            <span class="muted mono latest-meta">{{ d.author }} · {{ timeAgo(d.created_at) }}</span>
          </RouterLink>
        </div>
        <div class="latest-more" v-if="latest.length">
          <button v-if="latest.length < latestTotal" class="btn btn-sm btn-outline" type="button" :disabled="latestBusy" @click="loadMoreLatest">
            {{ latestBusy ? t('home.latest.loading', '加载中…') : t('home.latest.more', `加载更多（${latest.length}/${latestTotal}）`, { n: latest.length, total: latestTotal }) }}
          </button>
          <RouterLink v-else class="btn btn-sm btn-outline" to="/demos">{{ t('home.viewAll', '查看全部 →') }}</RouterLink>
        </div>
      </section>
    </div>

    <aside class="hub-side">
      <!-- 公告贴纸墙（03 §3.2：从页尾升到侧栏；未读徽章 + 去讨论互链，展示侧 AnnouncementBlock 已就绪） -->
      <section v-if="announcements.length" ref="annSide" class="side-card">
        <div class="side-head">
          <span class="side-title">{{ t('home.side.ann', '公告') }}</span>
          <span v-if="annUnread > 0" class="side-unread">{{ t('home.side.unread', '{n} 条未读', { n: annUnread }) }}</span>
        </div>
        <AnnouncementBlock v-if="projectAnnouncements.length" :title="t('home.ann.project', '项目公告')" :items="projectAnnouncements" @open="onAnnOpened" />
        <AnnouncementBlock v-if="systemAnnouncements.length" :title="t('home.ann.system', '系统公告')" :items="systemAnnouncements" @open="onAnnOpened" />
      </section>

      <!-- 论坛热帖 Top3（既有接口：GET /forum/topics?sort=hot） -->
      <section v-if="hotTopics.length" class="side-card">
        <div class="side-head">
          <span class="side-title">{{ t('home.side.hot', '论坛热帖') }}</span>
          <RouterLink class="side-more" to="/forum">{{ t('home.side.hotMore', '进讨论区 →') }}</RouterLink>
        </div>
        <RouterLink v-for="tp in hotTopics" :key="tp.id" class="side-row" :to="`/forum/topic/${tp.id}`">
          <span class="side-row-title">{{ tp.title }}</span>
          <span class="mono side-row-meta">{{ tp.reply_count }} {{ t('home.side.replies', '回复') }}</span>
        </RouterLink>
      </section>

      <!-- 榜单速览：神作 Top5 / 声望 Top5（既有接口，链到 /leaderboard 对应 tab） -->
      <section v-if="godTop.length || repTop.length" class="side-card">
        <div class="side-head">
          <span class="side-title">{{ t('home.side.board', '榜单速览') }}</span>
          <RouterLink class="side-more" to="/leaderboard">{{ t('home.side.boardMore', '全部榜单 →') }}</RouterLink>
        </div>
        <template v-if="godTop.length">
          <div class="side-sub">
            <RouterLink to="/leaderboard?tab=works&sort=god" class="side-sub-link">{{ t('home.side.god', '神作榜') }}</RouterLink>
          </div>
          <RouterLink v-for="d in godTop" :key="d.slug" class="side-row" :to="`/demo/${d.slug}`">
            <span class="side-row-title">{{ d.title }}</span>
            <span class="mono side-row-meta">★{{ d.rating_avg != null ? Number(d.rating_avg).toFixed(1) : '—' }}</span>
          </RouterLink>
        </template>
        <template v-if="repTop.length">
          <div class="side-sub">
            <RouterLink to="/leaderboard?tab=users&sort=reputation" class="side-sub-link">{{ t('home.side.rep', '声望榜') }}</RouterLink>
          </div>
          <RouterLink v-for="u in repTop" :key="u.id" class="side-row" :to="`/user/${u.username}`">
            <span class="side-row-title">{{ u.username }}</span>
            <span class="mono side-row-meta">{{ u.reputation }} {{ t('home.side.repUnit', '声望') }}</span>
          </RouterLink>
        </template>
      </section>

      <!-- 实时在线迷你（既有接口 GET /stats/live，10s 轮询照 About 模式） -->
      <section class="side-card">
        <div class="side-head">
          <span class="side-title">{{ t('home.side.live', '实时在线') }}</span>
          <span class="live-badge"><span class="live-dot"></span>LIVE</span>
        </div>
        <div class="side-live">
          <span class="side-live-num mono"><b>{{ live?.online ?? '—' }}</b> {{ t('home.side.online', '在线') }}</span>
          <span class="side-live-num mono"><b>{{ live?.today ?? '—' }}</b> {{ t('home.side.today', '今日') }}</span>
        </div>
      </section>

      <!-- 管理员过渡速览卡（03 §2.4：M0 一次性，M2 移除；计数走 adminQueues 单一口径） -->
      <RouterLink v-if="auth.isAdmin()" to="/admin" class="side-card side-admin">
        <div class="side-head">
          <span class="side-title">{{ t('home.side.admin', '工作台速览') }}</span>
        </div>
        <p class="side-admin-total">
          <b class="mono">{{ totalMust }}</b> {{ t('home.side.pending', '件待办') }}
        </p>
        <div class="side-admin-queues">
          <span class="side-admin-q">{{ t('adminQueues.review', '审核') }} {{ queues.review.count }}</span>
          <span class="side-admin-q">{{ t('adminQueues.inbox', '知识候选') }} {{ queues.inbox.count }}</span>
          <span class="side-admin-q">{{ t('adminQueues.clusters', '题目候选') }} {{ queues.clusters.count }}</span>
        </div>
      </RouterLink>
    </aside>
  </div>
  </div>
</template>

<style scoped>
/* ============================================================
   M0-D 入口胶囊（组件级样式；全局 style.css 冻结——令牌经 var() 引用全局既有值并带回落，
   P1 拆迁后并入 tokens 体系）
   ============================================================ */
.entry-caps-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.entry-capsule {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px; /* 03 §10.1-2 触达底线 */
  padding: 8px 14px;
  border: 4px solid var(--ink, #000);
  background: var(--paper, #fff);
  color: var(--ink, #000);
  box-shadow: 6px 6px 0 0 rgba(0, 0, 0, 1);
  font-family: var(--font-heading, sans-serif);
  font-weight: 800;
  font-size: 14px;
  text-decoration: none;
  cursor: pointer;
  transform: rotate(0deg); /* R8 静止零倾斜 */
  transition: transform var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1)),
    box-shadow var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1));
}
/* R6：hover 增影抬起（hover 设备限定）；R7：只动 transform/box-shadow */
@media (hover: hover) {
  .entry-capsule:hover {
    transform: translate(-2px, -2px);
    box-shadow: 8px 8px 0 0 rgba(0, 0, 0, 1);
  }
}
/* 法则 01：按压位移 = 阴影偏移，阴影清零，瞬间生效 */
.entry-capsule:active {
  transform: translate(4px, 4px);
  box-shadow: none;
  transition-duration: 0ms;
}
.entry-capsule-stamp {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  background: var(--yellow, #ffe66d);
  color: var(--on-accent, #000); /* 小面积章+黑字（t16 用户反馈） */
  border: 2px solid var(--ink, #000);
  font-family: var(--font-heading, sans-serif);
  font-weight: 900;
  font-size: 13px;
  transform: rotate(var(--tilt-deco, -1.5deg)); /* R8 白名单：印章装饰常驻倾斜 */
}
.entry-capsule-title {
  line-height: 1.2;
}
.entry-capsule-count {
  font-family: var(--font-body, monospace);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border: 2px solid var(--ink, #000);
  background: var(--paper-deep, #f2eee6);
  white-space: nowrap;
  /* 固定槽位：容纳最宽数字文案（「1,204 件作品」），首帧即占位，数字到位不推挤兄弟胶囊 */
  min-width: 92px;
  text-align: right;
  box-sizing: border-box;
}
.entry-capsule-count.pending {
  color: var(--ink-faint, #767676);
  font-weight: 500;
}
/* 移动端：2×2 大目标（03 §3.2）+ 50% 律（边框/阴影减半，R1/R2 令牌化前的手工口径） */
@media (max-width: 719px) {
  .entry-caps-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); /* t20：min-content 撑破 1fr 列（375 溢出 396）→ 可收缩列 */
  }
  .entry-capsule {
    border-width: 2px;
    box-shadow: 3px 3px 0 0 var(--ink);
    justify-content: flex-start;
    gap: 6px;
    padding: 6px 8px;
  }
  .entry-capsule-title {
    font-size: 12px;
  }
  .entry-capsule-count {
    min-width: 64px; /* 50% 律：槽位减半（92→64），「3 件作品」级短文案够住 */
    font-size: 10px;
    padding: 2px 4px;
  }
  .page-hero .huge {
    margin-top: 8px; /* t20 375 目验：eyebrow 章阴影压标题首行，分离一档 */
  }
  @media (hover: hover) {
    .entry-capsule:hover {
      box-shadow: 4px 4px 0 0 rgba(0, 0, 0, 1);
    }
  }
  .entry-capsule:active {
    transform: translate(2px, 2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .entry-capsule {
    transition: none;
  }
}

/* ============================================================
   M1-2 首页枢纽：主列 + sticky 侧栏（组件级样式；全局 style.css 冻结令生效中）
   ============================================================ */
.hub-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  padding: 0 0 8px;
}
.hub-main {
  min-width: 0;
}
.hub-block {
  margin-bottom: 28px;
}
.hub-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  align-self: stretch;
}
/* sticky 只在宽屏生效；窄屏侧栏自然沉到主列后（03 §3.2 移动线框顺序） */
@media (min-width: 1024px) {
  .hub-side {
    position: sticky;
    top: 86px; /* 顶栏高度 + 间距 */
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }
}
/* 换池口径说明行（策展透明，03 §3.2） */
.caliber-line {
  font-size: 12px;
  margin: -10px 0 14px;
}
/* 灰测折叠条 */
.gray-fold {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  background: var(--paper, #fff);
  border: var(--border-w, 4px) solid var(--ink, #000);
  box-shadow: 6px 6px 0 0 rgba(0, 0, 0, 1);
  cursor: pointer;
  font-family: var(--font-heading, sans-serif);
  color: var(--ink, #000);
}
.gray-fold-title {
  font-weight: 900;
  font-size: 15px;
}
.gray-fold-caret {
  margin-left: auto;
  transition: transform var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1));
}
.gray-fold-caret.open {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .gray-fold-caret {
    transition: none;
  }
}
/* 最新上传续流行 */
.latest-list {
  display: flex;
  flex-direction: column;
  border: var(--border-w, 4px) solid var(--ink, #000);
}
.latest-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px;
  color: var(--ink, #000);
  text-decoration: none;
  border-bottom: 2px solid var(--ink, #000);
}
.latest-row:last-child {
  border-bottom: none;
}
.latest-row:hover {
  background: var(--paper-deep, #f2eee6);
}
.latest-title {
  font-weight: 700;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.latest-meta {
  flex: none;
  font-size: 11px;
}
.latest-more {
  text-align: center;
  margin-top: 12px;
}
/* ---- 侧栏卡 ---- */
.side-card {
  background: var(--paper, #fff);
  border: var(--border-w, 4px) solid var(--ink, #000);
  box-shadow: 6px 6px 0 0 rgba(0, 0, 0, 1);
  padding: 14px;
}
.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.side-title {
  font-family: var(--font-heading, sans-serif);
  font-weight: 900;
  font-size: 15px;
}
.side-unread {
  font-size: 11px;
  font-weight: 900;
  padding: 2px 6px;
  background: var(--red, #ff6b6b);
  color: var(--on-accent, #000);
  border: 2px solid var(--ink, #000);
}
.side-more {
  font-size: 12px;
  color: var(--ink, #000);
  text-decoration: none;
  font-weight: 700;
}
.side-more:hover {
  text-decoration: underline;
}
.side-sub {
  margin: 8px 0 4px;
}
.side-sub-link {
  font-weight: 900;
  font-size: 12px;
  color: var(--ink, #000);
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.side-sub-link:hover {
  text-decoration: underline;
}
.side-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  color: var(--ink, #000);
  text-decoration: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.15);
}
.side-row:last-child {
  border-bottom: none;
}
.side-row:hover .side-row-title {
  text-decoration: underline;
}
.side-row-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.side-row-meta {
  flex: none;
  font-size: 11px;
}
.side-live {
  display: flex;
  gap: 12px;
}
.side-live-num {
  font-size: 12px;
}
.side-live-num b {
  font-size: 20px;
  margin-right: 4px;
}
/* 管理员速览卡（过渡件） */
.side-admin-total {
  margin: 0 0 8px;
  font-size: 13px;
}
.side-admin-total b {
  font-size: 26px;
  margin-right: 4px;
}
.side-admin-queues {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.side-admin-q {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border: 2px solid var(--ink, #000);
  background: var(--paper-deep, #f2eee6);
}
/* 窄屏：侧栏沉到主列后（03 §3.2 移动线框顺序），去 sticky */
@media (max-width: 1023px) {
  .hub-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
}
</style>
