<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../api'
import { t } from '../i18n'
import type { SiteInfo, SiteStats, SponsorBoard, ThanksBoard, LiveStats } from '../api/types'
import SectionHead from '../components/SectionHead.vue'

const stats = ref<SiteStats | null>(null)
const info = ref<SiteInfo | null>(null)
const sponsors = ref<SponsorBoard | null>(null)
const thanks = ref<ThanksBoard | null>(null)
const live = ref<LiveStats | null>(null)
const error = ref('')
const loading = ref(true)

const maxDay = computed(() => Math.max(1, ...(stats.value?.last7.map((d) => d.count) || [1])))
const recent48h = computed(() => (stats.value ? stats.value.today + stats.value.yesterday : 0))

let liveTimer: ReturnType<typeof setInterval> | null = null

async function loadLive() {
  try {
    live.value = await api.getLiveStats()
  } catch {
    /* 实时失败静默 */
  }
}

onMounted(async () => {
  try {
    const [s, sp, th, si] = await Promise.all([
      api.getSiteStats(),
      api.getSponsors().catch(() => null),
      api.getThanks().catch(() => null),
      api.getSiteInfo().catch(() => null),
    ])
    stats.value = s
    sponsors.value = sp
    thanks.value = th
    info.value = si
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
  await loadLive()
  liveTimer = setInterval(loadLive, 10_000)
})

onBeforeUnmount(() => {
  if (liveTimer) clearInterval(liveTimer)
})
</script>

<template>
  <div class="route-page">  <section class="page-hero">
    <span class="eyebrow">{{ t('about.eyebrow', '关于本站') }}</span>
    <h1 class="huge">{{ t('about.eyebrow', '关于本站') }}</h1>
    <p class="sub">{{ t('about.heroSub', '一个由 AI 模型生成的网页 Demo 作品集 —— 每个作品都附带生成会话日志与版本时间线，过程全透明。') }}</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载站点信息…</div>

    <template v-else>
      <!-- 站点概况（/meta/site-info：内容/社区一次拿全；失败静默隐藏） -->
      <template v-if="info">
        <SectionHead :title="t('about.snapshot', '站点概况')" />
        <div class="dash-stats">
          <div class="stat-card stat-ok"><b>{{ info.content.demos_total }}</b>{{ t('about.demos', '作品') }}</div>
          <div class="stat-card"><b>{{ info.content.authors_total }}</b>{{ t('about.authors', '创作者') }}</div>
          <div class="stat-card"><b>{{ info.content.uploads_last_7d }}</b>{{ t('about.uploads7d', '近 7 天新增') }}</div>
          <div class="stat-card"><b>{{ info.community.users_total }}</b>{{ t('about.users', '注册用户') }}</div>
        </div>
      </template>

      <!-- 实时访问 -->
      <SectionHead :title="t('about.live', '实时访问')">
        <span class="live-badge"><span class="live-dot"></span>LIVE</span>
      </SectionHead>
      <div class="dash-stats">
        <div class="stat-card stat-live"><b>{{ live?.online ?? '—' }}</b>{{ t('about.online', '在线') }}</div>
        <div class="stat-card"><b>{{ live?.last1min ?? '—' }}</b>{{ t('about.last1min', '近 1 分钟') }}</div>
        <div class="stat-card"><b>{{ live?.last5min ?? '—' }}</b>{{ t('about.last5min', '近 5 分钟') }}</div>
        <div class="stat-card stat-warn"><b>{{ live?.today ?? stats?.today ?? '—' }}</b>{{ t('about.today', '今日') }}</div>
      </div>
      <p class="hint live-hint">{{ t('about.liveHint', '页面停留时每 10s 自动刷新；离开页面不计入在线。') }}</p>

      <!-- 访问统计 -->
      <SectionHead :title="t('about.stats', '访问统计')" style="margin-top: 28px" />
      <div class="dash-stats">
        <div class="stat-card stat-ok"><b>{{ recent48h.toLocaleString() }}</b>{{ t('about.last48h', '近 48 小时') }}</div>
        <div class="stat-card"><b>{{ stats?.today.toLocaleString() }}</b>{{ t('about.today', '今日') }}</div>
        <div class="stat-card"><b>{{ stats?.yesterday.toLocaleString() }}</b>{{ t('about.yesterday', '昨日') }}</div>
        <div class="stat-card stat-warn"><b>{{ stats?.total.toLocaleString() }}</b>{{ t('about.total', '累计访问') }}</div>
      </div>

      <!-- 近 7 天趋势（纯 CSS 柱状图） -->
      <SectionHead v-if="stats?.last7?.length" :title="t('about.trend', '近 7 天趋势')" style="margin-top: 28px" />
      <div v-if="stats?.last7?.length" class="trend-card card card-default">
        <div class="trend-bars">
          <div v-for="(d, i) in stats.last7" :key="d.date" class="trend-col" :class="{ active: i === stats.last7.length - 1 }">
            <div class="trend-val">{{ d.count }}</div>
            <div class="trend-bar" :style="{ height: Math.max(8, Math.round((d.count / maxDay) * 140)) + 'px' }"></div>
            <div class="trend-date">{{ d.date.slice(5) }}</div>
          </div>
        </div>
      </div>

      <!-- 赞助榜（锚点 /about#sponsors：首页 CTA「支持维护」的目标位，05 §5.1 件 3） -->
      <SectionHead id="sponsors" :title="t('about.sponsors', '赞助榜')" style="margin-top: 28px">
        <span v-if="sponsors?.total_amount" class="mini-stat"><b>{{ sponsors.total_amount }}</b> {{ t('about.cumulative', '累计') }}</span>
      </SectionHead>
      <div v-if="sponsors?.sponsors?.length" class="sponsor-list">
        <div v-for="(s, i) in sponsors.sponsors" :key="s.name + i" class="sponsor-row" :class="'rank-' + (i + 1)">
          <span class="sponsor-rank">{{ i + 1 }}</span>
          <span class="sponsor-name">{{ s.name }}</span>
          <span v-if="s.amount" class="sponsor-amount">{{ s.amount }}</span>
          <span v-if="s.message" class="sponsor-msg">{{ s.message }}</span>
        </div>
      </div>
      <div v-else class="empty-box">{{ t('about.noSponsors', '暂无上榜，欢迎打赏支持') }}</div>

      <!-- 致谢榜 -->
      <SectionHead :title="t('about.thanks', '致谢榜')" style="margin-top: 28px" />
      <div v-if="thanks?.thanks?.length" class="sponsor-list">
        <div v-for="(t2, i) in thanks.thanks" :key="t2.name + i" class="sponsor-row">
          <span class="sponsor-rank thanks-rank" aria-hidden="true">{{ i + 1 }}</span>
          <span class="sponsor-name">{{ t2.name }}</span>
          <span v-if="t2.message" class="sponsor-msg">{{ t2.message }}</span>
        </div>
      </div>
      <div v-else class="empty-box">{{ t('about.noThanks', '暂无致谢') }}</div>

      <!-- M0 验收补项：声望怎么算（/about#reputation——榜单声望榜的说明锚点，03 §5.2 透明化口径） -->
      <SectionHead id="reputation" :title="t('about.repTitle', '声望怎么算')" style="margin-top: 28px" />
      <div class="card card-default" style="padding: 20px; max-width: 640px">
        <p style="line-height: 1.8; margin-bottom: 8px">{{ t('about.repAgg', '声望是用户档案的聚合统计：综合你发布的作品、获赞与收到感谢、发起的主题、回复、被关注等社区活动，由后端按 profile 聚合口径计算。') }}</p>
        <p class="muted" style="line-height: 1.8; margin-bottom: 8px">{{ t('about.repHonest', '我们不展示精确公式与实时分解：权重由后端算法决定，且可能随版本调整——给一个看起来精确的假公式，比诚实解释更误导。') }}</p>
        <p class="muted" style="line-height: 1.8; margin-bottom: 8px">{{ t('about.repNote', '想涨声望：发布作品、被点赞/感谢、参与讨论、被关注。声望是社区展示与激励，不是权限凭证。') }}</p>
        <div class="filter-row" style="margin-top: 12px; gap: 8px; flex-wrap: wrap">
          <RouterLink class="btn btn-sm btn-outline" to="/leaderboard?tab=users">{{ t('about.repBoard', '查看声望榜 →') }}</RouterLink>
        </div>
      </div>

      <!-- 杂项 -->
      <SectionHead :title="t('about.about', '关于')" style="margin-top: 28px" />
      <div class="card card-default" style="padding: 20px; max-width: 640px">
        <p style="line-height: 1.8; margin-bottom: 8px">{{ t('about.desc', '本站收集由 AI 模型生成的网页 Demo，作者可为已注册用户或匿名「公开用户」。所有作品附生成会话日志与版本时间线，力求过程透明。') }}</p>
        <p class="muted" style="font-size: 13px">{{ t('about.descNote', '时间线仅表示创建/更新记录，不等同于 AI 生成真实性证明。若需反馈或投稿，请到「上传 Demo」页。') }}</p>
        <div class="filter-row" style="margin-top: 14px; gap: 8px; flex-wrap: wrap">
          <a class="btn btn-sm btn-outline" href="https://github.com/liceses/ds-demos-showcase" target="_blank" rel="noopener">{{ t('about.repo', '网站仓库 →') }}</a>
          <a class="btn btn-sm btn-outline" href="mailto:1801203413@qq.com">{{ t('about.email', '站长邮箱：1801203413@qq.com') }}</a>
        </div>
      </div>
    </template>
  </section>
  </div>
</template>
