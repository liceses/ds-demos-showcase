<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import { getDeviceId } from '../utils/anon'
import type { RatingStats } from '../api/types'
import { t, lang } from '../i18n'

// distMax：柱高上限；layout：bars（宽版面柱形）| rows（窄栏横条+票数）
const props = withDefaults(defineProps<{ slug: string; distMax?: number; layout?: 'bars' | 'rows' }>(), { distMax: 22, layout: 'bars' })

const auth = useAuthStore()
const ui = useUiStore()

const rating = ref<RatingStats | null>(null)
const ratingLoading = ref(false)
const deviceId = ref('')

const SCORE_LABEL: Record<number, string> = { 5: '神作', 4: '佳作', 3: '一般', 2: '差', 1: '鬼作' }
const SCORE_LABEL_EN: Record<number, string> = { 5: 'Masterpiece', 4: 'Great', 3: 'OK', 2: 'Bad', 1: 'Disaster' }
function scoreLabel(score: number | null | undefined) {
  if (!score) return t('rating.unrated', '未评分')
  if (lang.value === 'en') return SCORE_LABEL_EN[score] || String(score)
  return SCORE_LABEL[score] || t('rating.scoreN', '{n} 分', { n: score })
}

const maxDist = computed(() => Math.max(1, ...(rating.value?.distribution?.map((d) => d.count) || [1])))

// 请求序号：只有「最新一次请求」的结果能写入 rating，防止旧响应覆盖新状态
let reqSeq = 0

async function loadRating() {
  deviceId.value = getDeviceId()
  const my = ++reqSeq
  try {
    const fresh = await api.getRating(props.slug, auth.isLoggedIn() ? undefined : deviceId.value)
    if (my === reqSeq) rating.value = fresh
  } catch {
    if (my === reqSeq) rating.value = null
  }
}

async function setScore(score: number) {
  if (ratingLoading.value) return
  ratingLoading.value = true
  const my = ++reqSeq
  try {
    const did = auth.isLoggedIn() ? undefined : deviceId.value
    const result =
      rating.value?.my_score === score
        ? await api.unrateDemo(props.slug, did)
        : await api.rateDemo(props.slug, score, did)
    if (my === reqSeq) rating.value = result
  } catch (e) {
    if (my === reqSeq) ui.toast((e as Error).message, 'error')
  } finally {
    ratingLoading.value = false
  }
}

onMounted(loadRating)
</script>

<template>
  <section class="section rating-section">
    <div class="card rating-card">
      <div class="rating-stars">
        <button
          v-for="s in [1, 2, 3, 4, 5]"
          :key="s"
          class="rating-star"
          :class="{ active: (rating?.my_score ?? 0) >= s, mine: rating?.my_score === s }"
          type="button"
          :disabled="ratingLoading"
          :title="`${s} ${t('rating.fen', '分')} · ${lang === 'en' ? SCORE_LABEL_EN[s] : SCORE_LABEL[s]}`"
          @click="setScore(s)"
        >★</button>
      </div>

      <div class="rating-meta">
        <div class="rating-avg">
          <b>{{ rating?.avg ?? 0 }}</b> / 5
          <span class="muted">{{ t('rating.ratedBy', '（{n} 人评）', { n: rating?.count ?? 0 }) }}</span>
          <span class="hint">{{ scoreLabel(rating?.my_score) }}</span>
        </div>
        <div class="rating-sub">
          <span class="rating-god">{{ t('rating.godShort', '神') }} {{ rating?.god ?? 0 }}</span>
          <span class="sep">·</span>
          <span class="rating-ghost">{{ t('rating.ghostShort', '鬼') }} {{ rating?.ghost ?? 0 }}</span>
          <span v-if="rating?.my_score" class="hint">{{ t('rating.mine', '我的评分：{n}（再点一次取消）', { n: rating?.my_score }) }}</span>
        </div>

        <!-- 窄栏（详情页右卡）用横条 + 票数：柱形在 356px 里读不出任何数值，
             只有"能比长短、能看见票数"的横条才算把这张图画对 -->
        <div v-if="rating?.distribution?.length && layout === 'rows'" class="rd-rows">
          <div
            v-for="d in [...rating.distribution].reverse()"
            :key="'r' + d.score"
            class="rd-row"
            :title="t('rating.distTip', '{n} 分：{c} 票', { n: d.score, c: d.count })"
          >
            <span class="rd-n mono">{{ d.score }}</span>
            <span class="rd-track"><i :class="'dist-' + d.score" :style="{ width: Math.round((d.count / maxDist) * 100) + '%' }"></i></span>
            <span class="rd-c mono">{{ d.count }}</span>
          </div>
        </div>
        <div v-else-if="rating?.distribution?.length" class="rating-dist">
          <div
            v-for="d in rating.distribution"
            :key="d.score"
            class="rating-dist-col"
            :title="t('rating.distTip', '{n} 分：{c} 票', { n: d.score, c: d.count })"
          >
            <div
              class="rating-dist-bar"
              :class="'dist-' + d.score"
              :style="{ height: Math.max(3, Math.round((d.count / maxDist) * distMax)) + 'px' }"
            ></div>
            <div class="rating-dist-score">{{ d.score }}</div>
          </div>
        </div>

        <div class="rating-legend">{{ t('rating.legend', '1 鬼作 · 2 差 · 3 一般 · 4 佳作 · 5 神作') }}</div>
        <p v-if="!auth.isLoggedIn()" class="hint rating-anon-hint">{{ t('rating.anonHint', '匿名评分会在当前浏览器记住，换浏览器/清缓存后无法找回') }}</p>
      </div>
    </div>
  </section>
</template>
