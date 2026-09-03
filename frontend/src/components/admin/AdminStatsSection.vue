<script setup lang="ts">
// 治理体检面板（B4）：看的是**覆盖率与积压**，不是标签数量 ——
// 概念文档反复强调：标签多不等于治理好，只有「作品被描述到了吗」才算。
defineOptions({ name: 'AdminStatsSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import type { KnowledgeStats } from '../../api/types'
import { t } from '../../i18n'
import LoadingRow from '../LoadingRow.vue'

const data = ref<KnowledgeStats | null>(null)
const loading = ref(true)
const error = ref('')

const TIER_LABEL: Record<number, string> = {
  1: '核心',
  2: '常用',
  3: '扩展',
}

const coverageRows = computed(() =>
  Object.entries(data.value?.coverage || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => a.tier - b.tier || b.rate - a.rate),
)
const backlog = computed(() =>
  Object.entries(data.value?.inbox.pending_actionable || {}).sort((a, b) => b[1] - a[1]),
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.getKnowledgeStats()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
      <span class="filter-label">{{ t('admin.stats.hint', '指标只认「作品被描述到了吗」，不认标签条数。') }}</span>
      <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading" :text="t('admin.stats.loading', '统计中…')" />

    <template v-else-if="data">
      <div class="refine-kpis">
        <div class="card card-default kpi">
          <span class="kpi-label">{{ t('admin.stats.kpiWorks', '已上架作品') }}</span>
          <b class="kpi-num">{{ data.demos_approved }}</b>
        </div>
        <div class="card card-mint kpi">
          <span class="kpi-label">{{ t('admin.stats.kpiModel', '模型覆盖率') }}</span>
          <b class="kpi-num">{{ (data.model_entity.rate * 100).toFixed(0) }}%</b>
          <span class="muted">{{ t('admin.stats.kpiModelN', '{a}/{b} 件挂了模型实体', { a: data.model_entity.demos, b: data.demos_approved }) }}</span>
        </div>
        <div class="card card-yellow kpi">
          <span class="kpi-label">{{ t('admin.stats.kpiInbox', '收件箱待批') }}</span>
          <b class="kpi-num">{{ data.inbox.pending }}</b>
          <span class="muted">{{ t('admin.stats.kpiInboxHint', '积压不等于脏，但超过一周就该看') }}</span>
        </div>
        <div class="card card-default kpi">
          <span class="kpi-label">{{ t('admin.stats.kpiDup', '重复 slug 实体') }}</span>
          <b class="kpi-num">{{ data.duplicate_slugs }}</b>
          <span class="muted">{{ data.duplicate_slugs ? t('admin.stats.kpiDupBad', '需要合并') : t('admin.stats.kpiDupOk', '干净') }}</span>
        </div>
      </div>

      <div class="section-head" style="margin-top: 24px">
        <h2 class="section-title">{{ t('admin.stats.covTitle', '按重要层的覆盖率') }}</h2>
        <span class="mini-stat">{{ t('admin.stats.covNote', 'tier1 是地基，掉到 90% 以下就该补') }}</span>
      </div>
      <table class="refine-table">
        <thead>
          <tr>
            <th>{{ t('admin.stats.thTier', '层') }}</th>
            <th>{{ t('admin.stats.thKey', '标签键') }}</th>
            <th>{{ t('admin.stats.thCover', '覆盖') }}</th>
            <th>{{ t('admin.stats.thBar', '') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in coverageRows" :key="c.key">
            <td><span class="cluster-badge" :class="c.tier === 1 ? 'cb-exact' : c.tier === 2 ? 'cb-similar' : 'cb-info'">T{{ c.tier }} {{ TIER_LABEL[c.tier] }}</span></td>
            <td><b>{{ c.label }}</b> <code class="mono muted">{{ c.key }}</code></td>
            <td class="mono">{{ c.demos }} / {{ (c.rate * 100).toFixed(0) }}%</td>
            <td style="width: 45%">
              <span class="cov-bar" :style="{ width: Math.max(2, c.rate * 100) + '%' }" :class="'cov-' + (c.rate >= 0.8 ? 'hi' : c.rate >= 0.5 ? 'mid' : 'low')"></span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="section-head" style="margin-top: 24px">
        <h2 class="section-title">{{ t('admin.stats.entityTitle', '实体健康度') }}</h2>
      </div>
      <div class="filter-row" style="margin: 0; flex-wrap: wrap">
        <span class="stat stat-teal">{{ t('admin.stats.modelsN', '模型 {n}', { n: data.model_entity.total_models }) }}</span>
        <span class="stat stat-mint">{{ t('admin.stats.activeN', '在用 {n}', { n: data.model_entity.active }) }}</span>
        <span class="stat stat-yellow">{{ t('admin.stats.unverifiedN', '灰测未证实 {n}', { n: data.model_entity.unverified }) }}</span>
        <span class="stat" :class="data.model_entity.candidate ? 'stat-red' : 'stat-teal'">{{ t('admin.stats.candidateN', '待确认 {n}', { n: data.model_entity.candidate }) }}</span>
        <span class="stat stat-teal">{{ t('admin.stats.retiredN', '已退役 {n}', { n: data.model_entity.deprecated }) }}</span>
        <RouterLink class="tag-chip mode-fixed" to="/models">{{ t('admin.stats.openModels', '模型管理 →') }}</RouterLink>
      </div>
      <div class="filter-row" style="margin: 10px 0 0; flex-wrap: wrap">
        <span class="stat stat-teal">{{ t('admin.stats.tasksN', '题目 {n}', { n: data.task.total }) }}</span>
        <span class="stat stat-mint">{{ t('admin.stats.tasksActive', '已确认 {n}', { n: data.task.active }) }}</span>
        <span class="stat" :class="data.task.candidate ? 'stat-yellow' : 'stat-teal'">{{ t('admin.stats.tasksCandidate', '候选 {n}', { n: data.task.candidate }) }}</span>
        <RouterLink class="tag-chip mode-fixed" to="/tasks">{{ t('admin.stats.openTasks', '题目管理 →') }}</RouterLink>
      </div>
      <p class="hint" style="margin-top: 8px">
        {{ t('admin.stats.taskGap', '题目数远小于作品数 = 同题对比这块价值还没铺开，去「巡检」和「题目候选」推进。') }}
      </p>

      <div class="section-head" style="margin-top: 24px">
        <h2 class="section-title">{{ t('admin.stats.backlogTitle', '待批候选构成') }}</h2>
      </div>
      <div v-if="!backlog.length" class="muted">{{ t('admin.stats.noBacklog', '收件箱是空的') }}</div>
      <div v-else class="filter-row" style="margin: 0; flex-wrap: wrap">
        <RouterLink v-for="[k, n] in backlog" :key="k" class="tag-chip mode-open" to="/admin">{{ k }}<span class="count">{{ n }}</span></RouterLink>
      </div>
    </template>
  </div>
</template>
