<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { SiteStats, SponsorBoard, ThanksBoard } from '../api/types'

const stats = ref<SiteStats | null>(null)
const sponsors = ref<SponsorBoard | null>(null)
const thanks = ref<ThanksBoard | null>(null)
const error = ref('')
const loading = ref(true)

const maxDay = computed(() => Math.max(1, ...(stats.value?.last7.map((d) => d.count) || [1])))
const recent48h = computed(() => (stats.value ? stats.value.today + stats.value.yesterday : 0))

onMounted(async () => {
  try {
    const [s, sp, th] = await Promise.all([
      api.getSiteStats(),
      api.getSponsors().catch(() => null),
      api.getThanks().catch(() => null),
    ])
    stats.value = s
    sponsors.value = sp
    thanks.value = th
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="page-hero">
    <span class="eyebrow">关于本站</span>
    <h1 class="huge">关于本站</h1>
    <p class="sub">一个由 AI 模型生成的网页 Demo 作品集 —— 每个作品都附带生成会话日志与版本时间线，过程全透明。</p>
  </section>

  <section class="section" style="padding-top: 8px">
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span> 加载站点信息…</div>

    <template v-else>
      <!-- 访问统计 -->
      <div class="section-head">
        <h2 class="section-title">访问统计</h2>
      </div>
      <div class="dash-stats">
        <div class="stat-card stat-ok"><b>{{ recent48h.toLocaleString() }}</b>近 48 小时</div>
        <div class="stat-card"><b>{{ stats?.today.toLocaleString() }}</b>今日</div>
        <div class="stat-card"><b>{{ stats?.yesterday.toLocaleString() }}</b>昨日</div>
        <div class="stat-card stat-warn"><b>{{ stats?.total.toLocaleString() }}</b>累计访问</div>
      </div>

      <!-- 近 7 天趋势（纯 CSS 柱状图） -->
      <div v-if="stats?.last7?.length" class="section-head" style="margin-top: 28px">
        <h2 class="section-title">近 7 天趋势</h2>
      </div>
      <div v-if="stats?.last7?.length" class="trend-card card card-default">
        <div class="trend-bars">
          <div v-for="(d, i) in stats.last7" :key="d.date" class="trend-col" :class="{ active: i === stats.last7.length - 1 }">
            <div class="trend-val">{{ d.count }}</div>
            <div class="trend-bar" :style="{ height: Math.max(8, Math.round((d.count / maxDay) * 140)) + 'px' }"></div>
            <div class="trend-date">{{ d.date.slice(5) }}</div>
          </div>
        </div>
      </div>

      <!-- 赞助榜 -->
      <div class="section-head" style="margin-top: 28px">
        <h2 class="section-title">赞助榜</h2>
        <span v-if="sponsors?.total_amount" class="mini-stat"><b>{{ sponsors.total_amount }}</b> 累计</span>
      </div>
      <div v-if="sponsors?.sponsors?.length" class="sponsor-list">
        <div v-for="(s, i) in sponsors.sponsors" :key="s.name + i" class="sponsor-row" :class="'rank-' + (i + 1)">
          <span class="sponsor-rank">{{ i + 1 }}</span>
          <span class="sponsor-name">{{ s.name }}</span>
          <span v-if="s.amount" class="sponsor-amount">{{ s.amount }}</span>
          <span v-if="s.message" class="sponsor-msg">{{ s.message }}</span>
        </div>
      </div>
      <div v-else class="empty-box">暂无上榜，欢迎打赏支持</div>

      <!-- 致谢榜 -->
      <div class="section-head" style="margin-top: 28px">
        <h2 class="section-title">致谢榜</h2>
      </div>
      <div v-if="thanks?.thanks?.length" class="sponsor-list">
        <div v-for="(t, i) in thanks.thanks" :key="t.name + i" class="sponsor-row">
          <span class="sponsor-rank thanks-rank" aria-hidden="true">{{ i + 1 }}</span>
          <span class="sponsor-name">{{ t.name }}</span>
          <span v-if="t.message" class="sponsor-msg">{{ t.message }}</span>
        </div>
      </div>
      <div v-else class="empty-box">暂无致谢</div>

      <!-- 杂项 -->
      <div class="section-head" style="margin-top: 28px">
        <h2 class="section-title">关于</h2>
      </div>
      <div class="card card-default" style="padding: 20px; max-width: 640px">
        <p style="line-height: 1.8; margin-bottom: 8px">本站收集由 AI 模型生成的网页 Demo，作者可为已注册用户或匿名「公开用户」。所有作品附生成会话日志与版本时间线，力求过程透明。</p>
        <p class="muted" style="font-size: 13px">时间线仅表示创建/更新记录，不等同于 AI 生成真实性证明。若需反馈或投稿，请到「上传 Demo」页。</p>
      </div>
    </template>
  </section>
</template>
