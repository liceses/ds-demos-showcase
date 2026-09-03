<script setup lang="ts">
// type:demo 拆分流水线（规则版）：`type:demo` 一个值吞了 46% 的作品 —— 那不是分类，是垃圾桶。
// 流程刻意是「预览 → 入队 → 收件箱批准」三步：规则在真实语料上未必准，
// 所以绝不自动改标签；批准那一步仍然归人（四层治理的最后一道）。
defineOptions({ name: 'AdminRefineSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import type { TypeDemoPreview } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import LoadingRow from '../LoadingRow.vue'
import EmptyBox from '../EmptyBox.vue'
import { t } from '../../i18n'

const ui = useUiStore()

const data = ref<TypeDemoPreview | null>(null)
const loading = ref(false)
const queueing = ref(false)
const error = ref('')
const minConfidence = ref(0.8) // 仿真校准：0.85+ 基本可信，0.72 档有误判，默认只放干净的一段
const limit = ref(500)

const demoRow = computed(() => (data.value?.stats.type_dist || []).find((x) => x.value === 'demo'))
const total = computed(() => data.value?.stats.approved || 0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.getTypeDemoPreview({ limit: limit.value, min_confidence: minConfidence.value })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function queue() {
  const n = data.value?.proposed ?? 0
  if (!n) return
  const ok = await ui.confirm({
    title: t('admin.refine.confirmTitle', '把建议放进收件箱？'),
    message: t('admin.refine.confirmMsg', '{n} 条细分建议会进入收件箱等待人工批准；在此之前不会改动任何作品标签。', { n }),
    confirmText: t('admin.refine.doQueue', '生成候选'),
  })
  if (!ok) return
  queueing.value = true
  try {
    const r = await api.queueTypeDemo({ limit: limit.value, min_confidence: minConfidence.value })
    ui.toast(t('admin.refine.queued', '候选已生成 {q} 条（建议 {p} 条，重复已去）', { q: r.queued, p: r.proposed }), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    queueing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
      <span class="filter-label">{{ t('admin.refine.hint', '规则只出建议，改标签仍要人在收件箱批准。') }}</span>
      <label class="filter-row" style="margin: 0; gap: 6px">
        <span class="muted">{{ t('admin.refine.minConf', '置信度 ≥') }}</span>
        <input v-model.number="minConfidence" class="input" type="number" step="0.05" min="0" max="1" style="max-width: 92px" />
      </label>
      <label class="filter-row" style="margin: 0; gap: 6px">
        <span class="muted">{{ t('admin.refine.scanN', '扫描最近') }}</span>
        <input v-model.number="limit" class="input" type="number" step="100" min="1" max="2000" style="max-width: 100px" />
      </label>
      <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>
      <button class="btn btn-sm btn-primary" type="button" :disabled="loading || queueing || !data?.proposed" @click="queue">
        {{ queueing ? t('admin.refine.queueing', '生成候选中…') : t('admin.refine.queueBtn', '生成候选') }}
      </button>
      <p class="hint" style="margin: 0 0 12px">
        {{ t('admin.refine.confTier', '置信度分档（真实语料校准）：≥85% 基本可信 · 72%~84% 偶有误判（多为单词命中）· 建议先用默认 80% 批量确认，低段逐条看。') }}
      </p>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading && !data" :text="t('admin.refine.loading', '跑规则中…')" />

    <template v-if="data">
      <div class="refine-kpis">
        <div class="card card-default refine-kpi">
          <span class="kpi-label">{{ t('admin.refine.kpiDemo', 'type:demo 体量') }}</span>
          <b class="kpi-num">{{ demoRow?.demos ?? 0 }}</b>
          <span class="muted">{{ t('admin.refine.kpiShare', '占已上架 {p}%', { p: ((demoRow?.rate || 0) * 100).toFixed(0) }) }}</span>
        </div>
        <div class="card card-mint refine-kpi">
          <span class="kpi-label">{{ t('admin.refine.kpiHit', '规则可细分') }}</span>
          <b class="kpi-num">{{ data.proposed }}</b>
          <span class="muted">{{ t('admin.refine.kpiCover', '覆盖 {p}% 的 demo 桶', { p: demoRow?.demos ? Math.round((data.proposed / demoRow.demos) * 100) : 0 }) }}</span>
        </div>
        <div class="card card-yellow refine-kpi">
          <span class="kpi-label">{{ t('admin.refine.kpiLeft', '命中不到（保持原样）') }}</span>
          <b class="kpi-num">{{ (demoRow?.demos ?? 0) - data.proposed }}</b>
          <span class="muted">{{ t('admin.refine.kpiHonest', '不硬塞值，宁可留着') }}</span>
        </div>
      </div>

      <div class="section-head" style="margin-top: 20px">
        <h2 class="section-title">{{ t('admin.refine.distTitle', '当前 type 分布') }}</h2>
      </div>
      <div class="filter-row" style="margin: 0 0 6px">
        <RouterLink
          v-for="x in data.stats.type_dist"
          :key="x.value"
          class="tag-chip mode-fixed"
          :to="`/tag/type/${x.value}`"
        >{{ x.value }}<span class="count">{{ x.demos }}</span></RouterLink>
      </div>

      <div class="section-head" style="margin-top: 20px">
        <h2 class="section-title">{{ t('admin.refine.targetTitle', '建议去向') }}</h2>
        <span class="mini-stat"><b>{{ Object.keys(data.by_target).length }}</b> {{ t('admin.refine.targetN', '个新细分值') }}</span>
      </div>
      <div v-if="!Object.keys(data.by_target).length" class="muted">{{ t('admin.refine.noTarget', '没有可细分的作品') }}</div>
      <div v-else class="filter-row" style="margin: 0">
        <span v-for="(n, k) in data.by_target" :key="k" class="tag-chip mode-open">{{ k }}<span class="count">{{ n }}</span></span>
      </div>

      <div class="section-head" style="margin-top: 20px">
        <h2 class="section-title">{{ t('admin.refine.samplesTitle', '建议样例（前 40 条）') }}</h2>
      </div>
      <EmptyBox v-if="!data.samples.length" :text="t('admin.refine.empty', '规则在这些作品上没抓到可信信号')" />
      <table v-else class="refine-table">
        <thead>
          <tr>
            <th>{{ t('admin.refine.thDemo', '作品') }}</th>
            <th>{{ t('admin.refine.thAdd', '建议改为') }}</th>
            <th>{{ t('admin.refine.thAlt', '次优') }}</th>
            <th>{{ t('admin.refine.thConf', '置信') }}</th>
            <th>{{ t('admin.refine.thWhy', '命中依据') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in data.samples" :key="s.demo_slug">
            <td>
              <RouterLink :to="`/demo/${s.demo_slug}`" target="_blank">{{ s.demo_title }}</RouterLink>
            </td>
            <td><b class="mono">{{ s.add }}</b> <span class="muted">{{ s.label_zh }}</span></td>
            <td class="mono muted">{{ (s.alt || []).join(' / ') || '—' }}</td>
            <td><span class="stat" :class="s.confidence >= 0.8 ? 'stat-mint' : 'stat-yellow'">{{ (s.confidence * 100).toFixed(0) }}%</span></td>
            <td class="muted refine-matched">{{ (s.matched || []).join('、') }}</td>
          </tr>
        </tbody>
      </table>
      <p class="hint" style="margin-top: 10px">
        {{ t('admin.refine.footHint', '入队后到「收件箱」逐条或批量批准；批准时若目标固定值不存在会自动补进词表（type 是 fixed 键）。') }}
        <span v-if="total" class="muted">· {{ t('admin.refine.footTotal', '当前已上架 {n} 件', { n: total }) }}</span>
      </p>
    </template>
  </div>
</template>
