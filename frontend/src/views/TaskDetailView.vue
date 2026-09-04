<script setup lang="ts">
// 题目页（v2 B2）：Benchmark = 固定 Task 比较多 Model。
// 对比行 = 小倍数原则（Tufte）：每模型一行（印章 + 作品数 + 社区分 + 最好作品），
// 明确不做雷达图/折线/综合排名结论（文档红线）。
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api'
import type { TaskDetail } from '../api/types'
import { parseDate, currentLocale } from '../utils/time'
import { tagLabel } from '../utils/funMode'
import { t } from '../i18n'
import EntityStamp from '../components/EntityStamp.vue'
// 作品瀑布已被证据表取代（DemoCard / MasonryGrid 因此不再需要）

const route = useRoute()
const task = ref<TaskDetail | null>(null)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  task.value = null
  try {
    task.value = await api.getTask(String(route.params.slug))
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(() => route.params.slug, load, { immediate: true })

// ---------- 链条视图（方案 A）----------
// 题面可能极长（实测 p90=1683 字、max=18466），默认折叠，展开才占版面
const briefOpen = ref(false)
const BRIEF_CLAMP = 260
const briefText = computed(() => task.value?.chain?.brief || '')
const briefLong = computed(() => briefText.value.length > BRIEF_CLAMP)
const shownBrief = computed(() => (briefOpen.value || !briefLong.value ? briefText.value : briefText.value.slice(0, BRIEF_CLAMP) + '…'))

type ChainSort = 'rating' | 'rounds' | 'title'
const chainSort = ref<ChainSort>('rating')
const onlySamePrompt = ref(false)
const chainRows = computed(() => {
  let rows = [...(task.value?.chain?.rows || [])]
  if (onlySamePrompt.value) rows = rows.filter((r) => r.same_prompt === true)
  const num = (v: number | null) => (v == null ? -1 : v)
  if (chainSort.value === 'rating') rows.sort((a, b) => num(b.rating_avg) - num(a.rating_avg) || b.rating_count - a.rating_count)
  else if (chainSort.value === 'rounds') rows.sort((a, b) => num(a.rounds) - num(b.rounds) || num(a.minutes) - num(b.minutes))
  else rows.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  return rows
})
/** 一致性统计：让"这道题是不是严格 benchmark"一眼可见 */
const chainStat = computed(() => {
  const rows = task.value?.chain?.rows || []
  return {
    same: rows.filter((r) => r.same_prompt === true).length,
    diff: rows.filter((r) => r.same_prompt === false).length,
    unknown: rows.filter((r) => r.same_prompt === null).length,
  }
})
</script>

<template>
  <div class="route-page">  <section v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('tasks.loading', '加载题目…') }}</section>

  <section v-else-if="error" class="empty-box">{{ error }}</section>

  <template v-else-if="task">
    <section class="page-hero" style="padding-bottom: 20px">
      <div class="model-hero-head">
        <EntityStamp :name="task.title" size="lg" />
        <div>
          <h1 class="huge" style="margin-top: 0">{{ task.title }}</h1>
          <div class="filter-row" style="margin-top: 6px; gap: 8px">
            <span v-if="task.category" class="mini-stat"><b>{{ task.category }}</b> {{ t('tasks.category', '分类') }}</span>
            <span class="mini-stat"><b>{{ task.demos_total }}</b> {{ t('tasks.entries', '作品') }}</span>
            <span class="mini-stat"><b>{{ task.compare.length }}</b> {{ t('tasks.modelsCount', '模型') }}</span>
          </div>
        </div>
      </div>
      <p v-if="task.description" class="sub" style="margin-top: 10px">{{ task.description }}</p>
    </section>

    <!-- 题面块：这道题到底让你做什么 —— 原来页面上完全看不到 -->
    <section v-if="task.chain && task.chain.brief" class="section" style="padding-top: 4px">
      <div class="brief-card card card-default">
        <div class="brief-head">
          <span class="brief-tag mono">{{ task.chain.brief_source === 'prompt' ? t('tasks.briefFromPrompt', '题面（取自作品提示词）') : t('tasks.briefFromAuthor', '题面') }}</span>
          <button v-if="briefLong" type="button" class="uw-edit" @click="briefOpen = !briefOpen">
            {{ briefOpen ? t('tasks.briefCollapse', '收起') : t('tasks.briefExpand', '展开全文') }}
          </button>
        </div>
        <p class="brief-text" :class="{ mono: task.chain.brief_source === 'prompt' }">{{ shownBrief }}</p>
        <!-- 一致性前提显式化：不同提示词的"同题对比"不是严格 benchmark -->
        <p v-if="chainStat.diff || chainStat.unknown" class="brief-caveat">
          <b>{{ t('tasks.caveat', '注意') }}</b>
          {{ t('tasks.caveatBody', '{n1} 件用了不同提示词、{n2} 件未填提示词 —— 它们与基准题面的对比不是严格同题。', { n1: chainStat.diff, n2: chainStat.unknown }) }}
        </p>
      </div>
    </section>

    <!-- 按模型对比（Benchmark 视图） -->
    <div class="section-head">
      <h2 class="section-title">{{ t('tasks.compareTitle', '按模型对比') }}</h2>
      <RouterLink class="btn btn-sm btn-primary" :to="`/upload?task=${task.slug}`">{{ t('tasks.challenge', '用你的模型挑战此题 →') }}</RouterLink>
    </div>
    <div v-if="!task.compare.length" class="empty-box">{{ t('tasks.emptyCompare', '还没有模型参与此题，等更多模型来挑战 →') }}</div>
    <div v-else class="compare-list">
      <div v-for="(row, i) in task.compare" :key="row.model.slug" class="compare-row card card-default">
        <span class="compare-rank" :class="'rank-' + (i + 1)">{{ i + 1 }}</span>
        <RouterLink class="compare-model" :to="`/models/${row.model.slug}`">
          <EntityStamp :name="row.model.name" :vendor="row.model.vendor" size="md" />
          <span class="model-chip-name">{{ tagLabel(row.model.name) }}</span>
        </RouterLink>
        <div class="compare-stats">
          <span class="stat stat-teal">DEMO {{ row.demo_count }}</span>
          <span class="stat stat-mint">RATE {{ row.avg_rating != null ? row.avg_rating.toFixed(1) : '—' }}</span>
          <!-- v2 B5′：轮数/耗时参与对比 —— 「一次生成过程」也是模型能力的一部分 -->
          <span class="stat stat-yellow">ROUND {{ row.avg_rounds != null ? row.avg_rounds : '—' }}</span>
          <span class="stat stat-red">MIN {{ row.avg_minutes != null ? row.avg_minutes : '—' }}</span>
        </div>
        <RouterLink v-if="row.best_demo" class="compare-best" :to="`/demo/${row.best_demo.slug}`">
          <!-- 措辞必须准确：多模型联合作品也会成为"含此模型的最高分"，
               写成"最好作品"会被读成"这个模型自己最好的答案"（实测每一行都指向同一件） -->
          {{ t('tasks.bestContaining', '含此模型的最高分：') }}{{ row.best_demo.title }} ★{{ row.best_demo.rating_avg.toFixed(1) }}
        </RouterLink>
      </div>
    </div>

    <!-- 证据表：一行一件作品，列即链条环节（读表 = 读链条）。
         取代原来的作品瀑布——瀑布把"谁做的、用哪句题面、跑了几轮"这些信息全丢了。 -->
    <div class="section-head" style="margin-top: 28px">
      <h2 class="section-title">{{ t('tasks.chainSection', '逐件证据') }}</h2>
      <div class="filter-row" style="margin: 0; flex-wrap: wrap">
        <button
          v-for="o in ([['rating', t('tasks.sortRating', '按评分')], ['rounds', t('tasks.sortRounds', '按轮数')], ['title', t('tasks.sortTitle', '按标题')]] as [ChainSort, string][])"
          :key="o[0]"
          type="button"
          class="tag-chip"
          :class="{ active: chainSort === o[0] }"
          @click="chainSort = o[0]"
        >{{ o[1] }}</button>
        <button type="button" class="tag-chip" :class="{ active: onlySamePrompt }" @click="onlySamePrompt = !onlySamePrompt">
          {{ t('tasks.onlySame', '只看同一题面') }}
        </button>
        <span class="muted mono">{{ chainRows.length }} / {{ task.chain?.rows.length ?? 0 }}</span>
      </div>
    </div>
    <div v-if="!chainRows.length" class="empty-box">{{ t('tasks.emptyDemos', '暂无作品') }}</div>
    <div v-else class="table-wrap">
      <table class="data chain-table">
        <thead>
          <tr>
            <th>{{ t('tasks.colModel', '模型') }}</th>
            <th>{{ t('tasks.colBrief', '题面') }}</th>
            <th>{{ t('tasks.colGen', '生成过程') }}</th>
            <th>{{ t('tasks.colWork', '作品') }}</th>
            <th>{{ t('tasks.colRating', '评分') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in chainRows" :key="r.slug">
            <td>
              <span v-if="!r.models.length" class="muted">—</span>
              <RouterLink v-for="m in r.models" :key="m.slug" class="chain-model" :to="`/models/${m.slug}`" target="_blank" rel="noopener">
                {{ tagLabel(m.name) }}
              </RouterLink>
            </td>
            <td>
              <!-- 一致性未知（未填提示词）不能算一致也不能算不一致 -->
              <span v-if="r.same_prompt === true" class="chain-yes">{{ t('tasks.sameYes', '同一题面') }}</span>
              <span v-else-if="r.same_prompt === false" class="chain-no">{{ t('tasks.sameNo', '不同题面') }}</span>
              <span v-else class="muted">{{ t('tasks.sameUnknown', '未填提示词') }}</span>
              <p v-if="r.prompt_excerpt" class="chain-excerpt mono">{{ r.prompt_excerpt }}</p>
            </td>
            <td class="chain-gen mono">
              <template v-if="r.rounds != null || r.minutes != null">
                {{ r.rounds != null ? `${r.rounds} ${t('tasks.roundsUnit', '轮')}` : '—' }} ·
                {{ r.minutes != null ? `${r.minutes} ${t('tasks.minutesUnit', '分')}` : '—' }}
              </template>
              <span v-else>—</span>
            </td>
            <td>
              <RouterLink class="chain-work" :to="`/demo/${r.slug}`">{{ r.title }}</RouterLink>
            </td>
            <td class="mono">
              <span v-if="r.rating_count">★{{ r.rating_avg?.toFixed(1) }} ({{ r.rating_count }})</span>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="muted mono" style="text-align: center; margin-top: 24px">
      {{ t('tasks.since', '收录') }} {{ parseDate(task.created_at).toLocaleDateString(currentLocale()) }}
    </p>
  </template>
  </div>
</template>
