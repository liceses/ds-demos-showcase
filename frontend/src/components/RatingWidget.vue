<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import { getDeviceId } from '../utils/anon'
import type { RatingStats } from '../api/types'

const props = defineProps<{ slug: string }>()

const auth = useAuthStore()
const ui = useUiStore()

const rating = ref<RatingStats | null>(null)
const ratingLoading = ref(false)
const deviceId = ref('')

const SCORE_LABEL: Record<number, string> = { 5: '神作', 4: '佳作', 3: '一般', 2: '差', 1: '鬼作' }
function scoreLabel(score: number | null | undefined) {
  return score ? SCORE_LABEL[score] || `${score} 分` : '未评分'
}

const maxDist = computed(() => Math.max(1, ...(rating.value?.distribution?.map((d) => d.count) || [1])))

async function loadRating() {
  deviceId.value = getDeviceId()
  try {
    const fresh = await api.getRating(props.slug, auth.isLoggedIn() ? undefined : deviceId.value)
    // 竞态保护：若用户已在此期间提交评分，保留新结果，避免慢一步的旧数据覆盖
    if (!rating.value) rating.value = fresh
  } catch {
    if (!rating.value) rating.value = null
  }
}

async function setScore(score: number) {
  if (ratingLoading.value) return
  ratingLoading.value = true
  try {
    const did = auth.isLoggedIn() ? undefined : deviceId.value
    rating.value =
      rating.value?.my_score === score
        ? await api.unrateDemo(props.slug, did)
        : await api.rateDemo(props.slug, score, did)
  } catch (e) {
    ui.toast((e as Error).message, 'error')
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
          :title="`${s} 分 · ${SCORE_LABEL[s]}`"
          @click="setScore(s)"
        >★</button>
      </div>

      <div class="rating-meta">
        <div class="rating-avg">
          <b>{{ rating?.avg ?? 0 }}</b> / 5
          <span class="muted">（{{ rating?.count ?? 0 }} 人评）</span>
          <span class="hint">{{ scoreLabel(rating?.my_score) }}</span>
        </div>
        <div class="rating-sub">
          <span class="rating-god">神 {{ rating?.god ?? 0 }}</span>
          <span class="sep">·</span>
          <span class="rating-ghost">鬼 {{ rating?.ghost ?? 0 }}</span>
          <span v-if="rating?.my_score" class="hint">我的评分：{{ rating.my_score }}（再点一次取消）</span>
        </div>

        <div v-if="rating?.distribution?.length" class="rating-dist">
          <div
            v-for="d in rating.distribution"
            :key="d.score"
            class="rating-dist-col"
            :title="`${d.score} 分：${d.count} 票`"
          >
            <div
              class="rating-dist-bar"
              :class="'dist-' + d.score"
              :style="{ height: Math.max(3, Math.round((d.count / maxDist) * 22)) + 'px' }"
            ></div>
            <div class="rating-dist-score">{{ d.score }}</div>
          </div>
        </div>

        <div class="rating-legend">1 鬼作 · 2 差 · 3 一般 · 4 佳作 · 5 神作</div>
        <p v-if="!auth.isLoggedIn()" class="hint rating-anon-hint">匿名评分会在当前浏览器记住，换浏览器/清缓存后无法找回</p>
      </div>
    </div>
  </section>
</template>
