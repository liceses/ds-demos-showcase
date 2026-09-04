<script setup lang="ts">
// 概览台（后台重设计 第 1 期）：回答管理员的第一个问题 —— "现在有什么等着我做"。
// 计数全部来自 adminQueues 的单一描述符，与侧栏徽章同一份数据，杜绝"徽章 12 条、点进去 0 条"。
// M2-t4 待办驱动升级（03 §9.3）：卡片 = kind 分组计数 + 「直达」深链（?tab=x&filter=y）
// + 卡上批量按钮（只挂在真有批量能力处：收件箱=本任务新建、归属=组内多选既有；
// 审核/簇/细分暂无批量端点，不放假门）；灰测池揭晓提醒常驻卡（90 天未揭晓标红）。
defineOptions({ name: 'AdminConsoleSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import type { AuditEntry, KnowledgeStats, AttributionPending } from '../../api/types'
import AdminStatsSection from './AdminStatsSection.vue'
import { useQueues } from '../../composables/adminQueues'
import { auditActionLabel, isDestructive, fmtTime, inboxKindLabel } from '../../utils/adminLabels'
import { parseDate } from '../../utils/time'
import { t } from '../../i18n'
import LoadingRow from '../LoadingRow.vue'

const emit = defineEmits<{ go: [tab: string, filter?: string] }>()
const { queues, loading, refresh } = useQueues()
const knowledge = ref<KnowledgeStats | null>(null)
const audit = ref<AuditEntry[]>([])
const error = ref('')
// M2-t4：收件箱 kind 分组计数（pending_by_kind 与收件箱面板同源接口）
const kindCounts = ref<Record<string, number>>({})

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

// M2-t4：收件箱卡 kind 计数条——按量取 Top3 直达（?tab=inbox&filter=k），其余合并展示
const kindSorted = computed(() => Object.entries(kindCounts.value).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]))
const kindTop = computed(() => kindSorted.value.slice(0, 3))
const kindRest = computed(() => kindSorted.value.slice(3).reduce((n, [, v]) => n + v, 0))

const coverage = computed(() => {
  const c = knowledge.value?.coverage || {}
  return ['model', 'type', 'category'].map((k) => ({
    key: k,
    label: c[k]?.label || k,
    demos: c[k]?.demos ?? 0,
    pct: Math.round((c[k]?.rate ?? 0) * 100),
  }))
})

// ---- M2-t4 灰测池揭晓提醒（常驻卡，02 §6.2-3「系统定期逼问」的落位）----
// 池 = resolution 'guess'（灰测未证实，model:ds-unknown 档）的兜底实体与其作品。
// 池件数：demo_count 精确；池龄：/demos?model=slug 末页第一件=最老件（现有接口 best-effort，
// 专用字段 oldest_demo_created_at = 后端协作项）；上次揭晓：审计 action=attribute 且
// after.from 含池 slug（缺专用字段=后端协作项，取近 50 条为窗口）。
const pool = ref<{ count: number; ageDays: number | null; lastRevealAt: string | null; lastRevealDays: number | null } | null>(null)
const poolRed = computed(() => {
  if (!pool.value) return false
  const d = pool.value.ageDays ?? pool.value.lastRevealDays
  return d != null && d >= 90
})

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - parseDate(iso).getTime()) / 86400000))
}

async function loadPool() {
  try {
    const pending: AttributionPending = await api.getAttributionPending()
    const guess = (pending.groups || []).filter((g) => g.model.resolution === 'guess')
    const count = guess.reduce((n, g) => n + (g.model.demo_count || g.demos.length), 0)
    const slugs = guess.map((g) => g.model.slug)
    let ageDays: number | null = null
    if (count > 0 && slugs.length) {
      // 池龄 best-effort：newest 排序末页末件=最老件（无 oldest 排序，故取末页；失败不阻塞卡片）
      try {
        const page = Math.ceil(count / 100)
        const res = await api.listDemos({ status: 'approved', model: slugs[0], sort: 'newest', page, page_size: 100 })
        const oldest = res.items[res.items.length - 1]
        if (oldest?.created_at) ageDays = daysSince(oldest.created_at)
      } catch {
        /* 池龄不可得 → 走上次揭晓口径 + 协作项注记 */
      }
    }
    let lastRevealAt: string | null = null
    try {
      const aud = await api.getAudit({ action: 'attribute', page_size: 50 })
      for (const e of aud.items) {
        let after: Record<string, unknown> | null = null
        if (e.after && typeof e.after === 'object') after = e.after as Record<string, unknown>
        else if (typeof e.after === 'string') {
          try {
            after = JSON.parse(e.after) as Record<string, unknown>
          } catch {
            after = null
          }
        }
        const from = Array.isArray(after?.from) ? (after!.from as unknown[]).map(String) : []
        if (slugs.some((s) => from.includes(s))) {
          lastRevealAt = e.created_at
          break
        }
      }
    } catch {
      /* 审计不可得 → 显示协作项文案 */
    }
    pool.value = {
      count,
      ageDays,
      lastRevealAt,
      lastRevealDays: lastRevealAt ? daysSince(lastRevealAt) : null,
    }
  } catch {
    pool.value = { count: 0, ageDays: null, lastRevealAt: null, lastRevealDays: null }
  }
}

function go(tab: string, filter?: string) {
  emit('go', tab, filter)
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
    const [k, a, sugg] = await Promise.all([api.getKnowledgeStats(), api.getAudit({ page_size: 6 }), api.listSuggestions({ status: 'pending' })])
    knowledge.value = k
    audit.value = a.items
    kindCounts.value = sugg.pending_by_kind || {}
  } catch (e) {
    error.value = (e as Error).message
  }
  void refresh()
  void loadPool()
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
      <template v-for="c in cards" :key="c.k">
        <!-- M2-t4：收件箱卡升级（kind 分组计数+直达深链+批量按钮）。div 承载子钮，避免 button 嵌套 button -->
        <div
          v-if="c.k === 'inbox'"
          class="ac-card"
          :class="{ hot: queues[c.k as keyof typeof queues]!.count > 0 }"
          role="button"
          tabindex="0"
          @click="go(c.tab)"
          @keydown.enter="go(c.tab)"
        >
          <b class="ac-num">{{ queues[c.k as keyof typeof queues]!.count }}</b>
          <span class="ac-label">{{ c.label }}</span>
          <span class="ac-why">{{ c.why }}</span>
          <div class="ac-card-actions" @click.stop @keydown.stop>
            <!-- kind 计数直达：?tab=inbox&filter=k（带条件直达，消灭"看见积压多点三下"） -->
            <button
              v-for="kd in kindTop"
              :key="kd[0]"
              type="button"
              class="ac-kind"
              :title="t('admin.console.kindGo', '带筛选直达收件箱')"
              @click="go('inbox', kd[0])"
            >
              {{ inboxKindLabel(kd[0]) }} <b>{{ kd[1] }}</b> →
            </button>
            <span v-if="kindRest > 0" class="muted mono">+{{ kindRest }}</span>
            <button type="button" class="btn btn-sm btn-primary" @click="go('inbox')">
              {{ t('admin.console.batchInbox', '按 kind 批量') }}
            </button>
          </div>
        </div>
        <!-- M2-t4：归属卡——组内多选批量归属+多数猜测预填已有（R9：单件工作台、整批归属分工不变） -->
        <div
          v-else-if="c.k === 'attribution'"
          class="ac-card"
          :class="{ hot: queues[c.k as keyof typeof queues]!.count > 0 }"
          role="button"
          tabindex="0"
          @click="go(c.tab)"
          @keydown.enter="go(c.tab)"
        >
          <b class="ac-num">{{ queues[c.k as keyof typeof queues]!.count }}</b>
          <span class="ac-label">{{ c.label }}</span>
          <span class="ac-why">{{ c.why }}</span>
          <div class="ac-card-actions" @click.stop @keydown.stop>
            <button type="button" class="btn btn-sm btn-primary" @click="go('attribution')">
              {{ t('admin.console.batchAttr', '批量归属') }}
            </button>
          </div>
        </div>
        <!-- 普通卡：无批量端点的面板不放假门，直达即可 -->
        <button v-else type="button" class="ac-card" :class="{ hot: queues[c.k as keyof typeof queues]!.count > 0 }" @click="go(c.tab)">
          <b class="ac-num">{{ queues[c.k as keyof typeof queues]!.count }}</b>
          <span class="ac-label">{{ c.label }}</span>
          <span class="ac-why">{{ c.why }}</span>
        </button>
      </template>
    </div>

    <!-- M2-t4 灰测池揭晓提醒（常驻卡，03 §9.3）：池件数/池龄/上次揭晓；90 天未揭晓标红 -->
    <section class="ac-pool" :class="{ 'ac-pool-red': poolRed }" aria-live="polite">
      <div class="ac-pool-line">
        <b class="ac-pool-title">{{ t('admin.console.poolTitle', '▍灰测揭晓提醒') }}</b>
        <span class="ac-pool-stat">
          {{ t('admin.console.poolCount', '池 {n} 件', { n: pool?.count ?? 0 }) }}
          <span class="muted">·</span>
          <template v-if="pool?.ageDays != null">{{ t('admin.console.poolAge', '最老约 {d} 天（按最老一件估算）', { d: pool.ageDays }) }}</template>
          <template v-else>{{ t('admin.console.poolAgeNA', '池龄待后端字段（oldest_demo_created_at 协作项）') }}</template>
          <span class="muted">·</span>
          <template v-if="pool?.lastRevealAt">{{ t('admin.console.poolLast', '上次揭晓 {d}', { d: pool.lastRevealAt.slice(0, 10) }) }}</template>
          <template v-else>{{ t('admin.console.poolLastNA', '上次揭晓：近 50 条审计无记录（待后端专用字段）') }}</template>
        </span>
        <button type="button" class="btn btn-sm btn-outline" @click="go('attribution')">{{ t('admin.console.poolGo', '去归属 →') }}</button>
      </div>
      <span v-if="poolRed" class="ac-pool-flag">{{ t('admin.console.poolRed', '灰测池已 90 天未揭晓——按 §6.2-3 该定期逼问了，尽快批量归位') }}</span>
    </section>

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

<style scoped>
/* ---- M2-t4 概览台升级（admin scoped 纪律：styles/ 零新增块）---- */
/* 卡上动作区：kind 直达链 + 批量按钮（inbox/attribution 卡由 button 改 div 承载） */
.ac-card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  border-top: 2px solid var(--ink, #000);
  padding-top: 10px;
}
.ac-kind {
  border: 2px solid var(--ink, #000);
  background: var(--paper, #fff);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  padding: 4px 8px;
  cursor: pointer;
  min-height: 32px;
}
@media (hover: hover) {
  .ac-kind:hover {
    background: var(--yellow, #ffe66d);
  }
}
.ac-kind:active {
  transform: translate(2px, 2px);
}
/* 灰测池常驻卡：默认纸面 3px 墨框；90 天红线 = 左缘 9px --err（与 ac-card.hot 同语汇） */
.ac-pool {
  margin-top: 18px;
  padding: 12px 14px;
  border: var(--border-w, 4px) solid var(--ink, #000);
  background: var(--paper, #fff);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.ac-pool-red {
  border-left: 9px solid var(--err, #ff6b6b);
}
.ac-pool-title {
  font-size: 14px;
  font-weight: 900;
}
.ac-pool-stat {
  font-size: 13px;
  font-weight: 700;
}
.ac-pool-flag {
  flex-basis: 100%;
  font-size: 12px;
  font-weight: 900;
  color: var(--err, #ff6b6b);
}
</style>