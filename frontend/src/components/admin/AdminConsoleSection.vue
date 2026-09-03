<script setup lang="ts">
// 概览台（后台重设计 第 1 期）：回答管理员的第一个问题 —— "现在有什么等着我做"。
// 计数全部来自 adminQueues 的单一描述符，与侧栏徽章同一份数据，杜绝"徽章 12 条、点进去 0 条"。
defineOptions({ name: 'AdminConsoleSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import type { AuditEntry, KnowledgeStats } from '../../api/types'
import AdminStatsSection from './AdminStatsSection.vue'
import { useQueues } from '../../composables/adminQueues'
import { auditActionLabel, isDestructive, fmtTime } from '../../utils/adminLabels'
import { t } from '../../i18n'
import LoadingRow from '../LoadingRow.vue'

const emit = defineEmits<{ go: [tab: string] }>()
const { queues, loading, refresh } = useQueues()
const knowledge = ref<KnowledgeStats | null>(null)
const audit = ref<AuditEntry[]>([])
const error = ref('')

// 队列卡片：跳转目标就是现有面板的 key（壳层不改面板内部）
const cards = computed(() => [
  { k: 'review', tab: 'review', label: t('admin.console.qReview', '待审作品'), why: t('admin.console.qReviewWhy', '匿名与信任通道上传都先落这里') },
  { k: 'inbox', tab: 'inbox', label: t('admin.console.qInbox', '知识候选待批'), why: t('admin.console.qInboxWhy', '机器推的挂题/细分/合并，批了才生效') },
  { k: 'clusters', tab: 'clusters', label: t('admin.console.qClusters', '可成题的簇'), why: t('admin.console.qClustersWhy', '同一句提示词被多模型答过') },
  { k: 'refine', tab: 'refine', label: t('admin.console.qRefine', '可细分/可补的类型'), why: t('admin.console.qRefineWhy', 'type:demo 垃圾桶与缺 type 的作品') },
  { k: 'attribution', tab: 'attribution', label: t('admin.console.qAttribution', '挂在兜底型号上的作品'), why: t('admin.console.qAttributionWhy', '未标注/未定型号/灰测，可批量归位') },
  { k: 'wordlist', tab: 'tags', label: t('admin.console.qWordlist', '固定值缺介绍'), why: t('admin.console.qWordlistWhy', '词表补课：悬浮提示与搜索都靠它') },
])

const total = computed(() => cards.value.reduce((n, c) => n + (queues.value[c.k as keyof typeof queues.value]!.count || 0), 0))

const coverage = computed(() => {
  const c = knowledge.value?.coverage || {}
  return ['model', 'type', 'category'].map((k) => ({
    key: k,
    label: c[k]?.label || k,
    demos: c[k]?.demos ?? 0,
    pct: Math.round((c[k]?.rate ?? 0) * 100),
  }))
})

function go(tab: string) {
  emit('go', tab)
}
/** 覆盖率数字就地展开指标区（同一页内解决，不再跳去重复面板） */
function showStats() {
  const el = document.getElementById('dv-stats')
  if (!el) return
  el.setAttribute('open', '')
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function load() {
  error.value = ''
  try {
    const [k, a] = await Promise.all([api.getKnowledgeStats(), api.getAudit({ page_size: 6 })])
    knowledge.value = k
    audit.value = a.items
  } catch (e) {
    error.value = (e as Error).message
  }
  void refresh()
}

onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px">
      <span class="filter-label">{{ t('admin.console.hint', '按待办量排序的入口台。数字只统计"等你处理"的，不统计"已经存在"的。') }}</span>
      <button class="btn btn-sm btn-secondary" type="button" @click="load">↻ {{ t('common.refresh', '刷新') }}</button>
    </div>
    <div v-if="error" class="notice notice-error">{{ error }}</div>

    <div class="ac-hero">
      <div>
        <b class="ac-total">{{ total }}</b>
        <span class="ac-hero-label">{{ t('admin.console.total', '项待办') }}</span>
      </div>
      <LoadingRow v-if="loading" :text="t('admin.console.loading', '统计队列中…')" />
    </div>

    <div class="ac-grid">
      <button
        v-for="c in cards"
        :key="c.k"
        type="button"
        class="ac-card"
        :class="{ hot: queues[c.k as keyof typeof queues]!.count > 0 }"
        @click="go(c.tab)"
      >
        <b class="ac-num">{{ queues[c.k as keyof typeof queues]!.count }}</b>
        <span class="ac-label">{{ c.label }}</span>
        <span class="ac-why">{{ c.why }}</span>
      </button>
    </div>

    <div class="section-head" style="margin-top: 26px">
      <h2 class="section-title">{{ t('admin.console.covTitle', '覆盖率快照') }}</h2>
      <span class="muted">{{ t('admin.console.covNote', '只认"作品被描述到了吗"') }}</span>
    </div>
    <div class="filter-row" style="margin: 0; flex-wrap: wrap">
      <!-- 覆盖率快照就地可点：点开下方「全部指标」，不再跳去一个重复的面板 -->
      <button v-for="c in coverage" :key="c.key" type="button" class="ac-cov" @click="showStats">
        <b>{{ c.pct }}%</b> {{ c.label }}<span class="muted mono"> {{ c.demos }}</span>
      </button>
      <span v-if="knowledge" class="ac-cov" :class="{ bad: knowledge.duplicate_slugs > 0 }">
        <b>{{ knowledge.duplicate_slugs }}</b> {{ t('admin.console.dup', '重复 slug 实体') }}
      </span>
      <button type="button" class="tag-chip mode-fixed" @click="showStats">{{ t('admin.console.more', '全部指标 →') }}</button>
    </div>

    <!-- 体检指标并入概览台：原来"概览台"与"体检"讲同一批数，两处必然漂移（后台重设计 §5） -->
    <details id="dv-stats" class="dv-disclose dv-stats">
      <summary>
        <b>{{ t('admin.console.allMetrics', '全部指标') }}</b>
        <span class="dv-disclose-hint">{{ t('admin.console.metricsHint', '覆盖率、积压、重复率与趋势') }}</span>
      </summary>
      <div class="dv-disclose-body">
        <AdminStatsSection />
      </div>
    </details>

    <div class="section-head" style="margin-top: 26px">
      <h2 class="section-title">{{ t('admin.console.auditTitle', '最近变更') }}</h2>
      <button type="button" class="btn btn-sm btn-outline" @click="go('audit')">{{ t('admin.console.auditCta', '审计日志 →') }}</button>
    </div>
    <div v-if="!audit.length" class="muted">{{ t('admin.console.noAudit', '还没有治理动作') }}</div>
    <ul v-else class="ac-audit">
      <li v-for="a in audit" :key="a.id">
        <span class="mono ac-time">{{ fmtTime(a.created_at) }}</span>
        <span class="mono ac-actor">{{ a.actor }}</span>
        <span class="ac-act" :class="{ warn: isDestructive(a.action) }">{{ auditActionLabel(a) }}</span>
        <span class="muted">{{ a.reason || `${a.entity_type}#${a.entity_id}` }}</span>
      </li>
    </ul>
  </div>
</template>
