<script setup lang="ts">
// 治理收件箱（v2 B4′ 最小版）：所有知识变更建议都从这里过一遍人工。
// 规则：approve 才由后端 service 真正执行（挂题/建实体/合并），本面板不改任何本地状态猜测。
// M2-t4 批量消化（02 P5/03 §9.3）：按 kind 分节+全选/多选批量批准/驳回。
// 【批量端点实测 2026-02】后端仅 POST /admin/suggestions/{sid}/review 单条端点，
// 无批量端点 → 批量走前端限速循环 5/s（BATCH_INTERVAL_MS=200）；「前端批量」已在 UI 标注，
// 后端协作清单：POST /admin/suggestions/batch-review{action, ids}（事务内逐条落审计）。
// 治理语义（可撤销才给批量）：批准效果逐条可审计回溯（unmerge/删实体/撤挂均有端点），
// 驳回不销毁数据（引擎可再次提名）——故两种批量都提供，批准走强确认（影响面 N 条预览）。
// 顺手修：后端 GET /suggestions 的 kind pattern 不含 retag_demo（传了 422）→ 该 kind 改客户端过滤。
defineOptions({ name: 'AdminInboxSection' })
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../../api'
import type { SuggestionItem } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import { parseDate } from '../../utils/time'
import { INBOX_KINDS, inboxKindLabel } from '../../utils/adminLabels'
import LoadingRow from '../LoadingRow.vue'
import EmptyBox from '../EmptyBox.vue'
import { t } from '../../i18n'

const ui = useUiStore()
const route = useRoute()

const items = ref<SuggestionItem[]>([])
const counts = ref<Record<string, number>>({})
const reviewFloor = ref(0.6)
const status = ref<'pending' | 'approved' | 'rejected' | 'all'>('pending')
const kind = ref('')
const loading = ref(false)
const busy = ref<Record<number, boolean>>({})
const error = ref('')

const KIND_LABELS = INBOX_KINDS // 单一源（utils/adminLabels），概览台 kind 直达链同词表

// ---- M2-t4 批量选择态 ----
const selected = ref<Set<number>>(new Set())
const batchRunning = ref(false)
const batchProgress = ref<{ done: number; total: number } | null>(null)
const batchLastAction = ref<'approve' | 'reject' | null>(null)
const failed = ref<{ id: number; kind: string; brief: string; message: string }[]>([])
/** 前端限速 5/s：单条 review 端点循环；后端批量端点落地后此循环可整体替换 */
const BATCH_INTERVAL_MS = 200

const total = computed(() => Object.values(counts.value).reduce((a, b) => a + b, 0))

function brief(s: SuggestionItem): string {
  const p = s.payload as Record<string, unknown>
  const str = (v: unknown) => (v == null ? '' : String(v))
  switch (s.kind) {
    case 'task_match':
      return `《${str(p.demo_title) || str(p.demo_slug) || p.demo_id}》→ ${str(p.task_title) || str(p.task_id)}`
    case 'new_model':
    case 'alias':
      return str(p.name) || str(p.alias) || str(p.model_id)
    case 'retag_demo':
      return `《${str(p.demo_title) || str(p.demo_slug)}》type:${str(p.remove || 'demo')} → type:${str(p.add)}${
        Array.isArray(p.matched) && p.matched.length ? `（命中：${p.matched.slice(0, 3).join('、')}）` : ''
      }`
    case 'new_task':
      return str(p.title) || str(p.task_id)
    default:
      return `${str(p.source_id ?? p.source ?? '')} → ${str(p.target_id ?? p.target ?? '')}`
  }
}

function effectOf(s: SuggestionItem): string {
  if (s.kind === 'task_match') return t('admin.inbox.effectAttach', '批准后该作品进入同题对比')
  if (s.kind === 'new_model') return t('admin.inbox.effectModel', '通过后创建模型实体（active）')
  if (s.kind === 'new_task') return t('admin.inbox.effectTask', '批准后创建题目并按建议挂题')
  if (s.kind === 'retag_demo') return t('admin.inbox.effectRetag', '通过后仅替换该作品的 type 值，其他标签不动')
  return t('admin.inbox.effectMerge', '通过后迁移引用并废弃源实体（可审计回溯）')
}

/** 后端 GET /suggestions 的 kind 过滤 pattern 不含 retag_demo（传了 422）→ 客户端过滤 */
function isClientFilteredKind(k: string): boolean {
  return k === 'retag_demo'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const clientFiltered = kind.value !== '' && isClientFilteredKind(kind.value)
    const res = await api.listSuggestions({ status: status.value, kind: clientFiltered ? undefined : kind.value || undefined })
    items.value = clientFiltered ? res.items.filter((s) => s.kind === kind.value) : res.items
    counts.value = res.pending_by_kind
    reviewFloor.value = res.thresholds.review
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

// ---- M2-t4：待处理视图按 kind 分节（组内保持 confidence/id 排序；组间按积压量降序）----
const kindGroups = computed(() => {
  if (status.value !== 'pending') return null
  const map = new Map<string, SuggestionItem[]>()
  for (const s of items.value) {
    const list = map.get(s.kind) || []
    list.push(s)
    map.set(s.kind, list)
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
})

function pendingOf(kindKey: string): SuggestionItem[] {
  return items.value.filter((s) => s.kind === kindKey)
}

function toggle(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleKind(kindKey: string) {
  const next = new Set(selected.value)
  const rows = pendingOf(kindKey)
  const allOn = rows.length > 0 && rows.every((s) => next.has(s.id))
  for (const s of rows) {
    if (allOn) next.delete(s.id)
    else next.add(s.id)
  }
  selected.value = next
}

function kindAllSelected(kindKey: string): boolean {
  const rows = pendingOf(kindKey)
  return rows.length > 0 && rows.every((s) => selected.value.has(s.id))
}

function clearSelection() {
  selected.value = new Set()
}

const selectedRows = computed(() => items.value.filter((s) => selected.value.has(s.id)))

/** 批量执行（前端限速循环 5/s）：失败列表可重试；进度实时可见 */
async function runBatch(action: 'approve' | 'reject', idsOverride?: number[]) {
  const rows = idsOverride ? items.value.filter((s) => idsOverride.includes(s.id)) : selectedRows.value
  const ids = rows.map((r) => r.id)
  if (!ids.length || batchRunning.value) return
  if (action === 'approve') {
    // 影响面 N 条预览 + 治理语义注记（可撤销才给批量：批准逐条可审计回溯，驳回可由引擎再次提名）
    const preview = rows.slice(0, 5).map((s) => `· ${brief(s)}\n  ${effectOf(s)}`).join('\n')
    const ok = await ui.confirm({
      title: t('admin.inbox.batchConfirmTitle', '批量批准 {n} 条建议？', { n: ids.length }),
      message:
        `${preview}${rows.length > 5 ? `\n…${t('admin.inbox.batchMore', '等共 {n} 条', { n: rows.length })}` : ''}\n\n` +
        t('admin.inbox.batchUndoNote', '治理语义：批准效果逐条可审计回溯（合并可 unmerge/实体可删/挂题可撤）；驳回不销毁数据，引擎可再次提名。'),
      confirmText: t('admin.inbox.batchApprove', '批量批准（前端 5/s）'),
    })
    if (!ok) return
  }
  batchRunning.value = true
  batchLastAction.value = action
  failed.value = []
  const fails: typeof failed.value = []
  batchProgress.value = { done: 0, total: ids.length }
  let i = 0
  for (const id of ids) {
    const item = rows.find((r) => r.id === id)
    try {
      await api.reviewSuggestion(id, action)
    } catch (e) {
      fails.push({ id, kind: item?.kind || '', brief: item ? brief(item) : `#${id}`, message: (e as Error).message })
    }
    i++
    batchProgress.value = { done: i, total: ids.length }
    if (i < ids.length) await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS))
  }
  failed.value = fails
  batchRunning.value = false
  batchProgress.value = null
  selected.value = new Set()
  const okCount = ids.length - fails.length
  ui.toast(
    t('admin.inbox.batchDone', '批量{action}完成：成功 {ok} · 失败 {bad}', {
      action: action === 'approve' ? t('admin.inbox.approve', '批准') : t('admin.inbox.reject', '驳回'),
      ok: okCount,
      bad: fails.length,
    }),
    fails.length ? 'error' : 'success',
  )
  await load()
}

function retryFailed() {
  if (!failed.value.length || !batchLastAction.value) return
  void runBatch(batchLastAction.value, failed.value.map((f) => f.id))
}

async function review(s: SuggestionItem, action: 'approve' | 'reject') {
  if (action === 'approve') {
    const ok = await ui.confirm({
      title: t('admin.inbox.confirmApprove', '批准这条建议？'),
      message: `${brief(s)}\n${effectOf(s)}`,
      confirmText: t('admin.inbox.approve', '批准'),
    })
    if (!ok) return
  }
  busy.value[s.id] = true
  try {
    const done = await api.reviewSuggestion(s.id, action)
    ui.toast(
      action === 'approve'
        ? done.result || t('admin.inbox.doneApprove', '已批准并执行')
        : t('admin.inbox.doneReject', '已驳回'),
      'success',
    )
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value[s.id] = false
  }
}

onMounted(() => {
  // M2-t4 深链：?tab=inbox&filter=<kind>（概览台 kind 计数直达）；未知 filter 忽略
  const f = String(route.query.filter || '')
  if (f && INBOX_KINDS[f]) kind.value = f
  void load()
})
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
      <span class="filter-label">{{ t('admin.inbox.hint', '低置信度建议默认不进此视图（阈值以下只记录不骚扰）') }}</span>
      <select v-model="status" class="input" style="max-width: 130px" @change="load">
        <option value="pending">{{ t('admin.inbox.pending', '待处理') }}</option>
        <option value="approved">{{ t('admin.inbox.approved', '已批准') }}</option>
        <option value="rejected">{{ t('admin.inbox.rejected', '已驳回') }}</option>
        <option value="all">{{ t('common.all', '全部') }}</option>
      </select>
      <select v-model="kind" class="input" style="max-width: 150px" @change="load">
        <option value="">{{ t('admin.inbox.allKinds', '全部类型') }}</option>
        <option v-for="(v, k) in KIND_LABELS" :key="k" :value="k">{{ v[0] }}</option>
      </select>
      <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>
      <span v-if="status === 'pending'" class="mini-stat"><b>{{ total }}</b> {{ t('admin.inbox.total', '条待处理') }}</span>
      <span v-for="(n, k) in counts" :key="k" class="tag-chip mode-open">{{ KIND_LABELS[k]?.[0] || k }} <b class="count">{{ n }}</b></span>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading && !items.length" :text="t('admin.inbox.loading', '加载收件箱…')" />
    <EmptyBox v-else-if="!items.length" :text="t('admin.inbox.empty', '队列是空的 —— 没有需要人工判断的建议')" />

    <!-- M2-t4 批量工具条：选中即现；批量走前端限速循环（后端批量端点=协作清单），影响面先确认 -->
    <div v-if="status === 'pending' && (selected.size > 0 || batchRunning || failed.length)" class="inbox-batch card card-default" data-cdp="inbox-batch">
      <template v-if="batchRunning">
        <b>{{ t('admin.inbox.batchProgress', '批量执行中 {done}/{total}（前端 5/s 限速）', batchProgress!) }}</b>
      </template>
      <template v-else>
        <div class="filter-row" style="margin: 0; flex-wrap: wrap; align-items: center">
          <b>{{ t('admin.inbox.batchSelected', '已选 {n} 条', { n: selected.size }) }}</b>
          <button class="btn btn-sm btn-primary" type="button" @click="runBatch('approve')">
            {{ t('admin.inbox.batchApprove', '批量批准（前端 5/s）') }}
          </button>
          <button class="btn btn-sm btn-dark" type="button" @click="runBatch('reject')">
            {{ t('admin.inbox.batchReject', '批量驳回') }}
          </button>
          <button class="btn btn-sm btn-outline" type="button" @click="clearSelection">
            {{ t('admin.inbox.batchClear', '清空选择') }}
          </button>
          <span class="hint">{{ t('admin.inbox.batchFrontNote', '批量=前端限速循环（5/s）逐条调用单条端点；后端批量端点在协作清单') }}</span>
        </div>
        <div v-if="failed.length" class="inbox-failed">
          <b>{{ t('admin.inbox.batchFailTitle', '失败 {n} 条：', { n: failed.length }) }}</b>
          <span v-for="f in failed" :key="f.id" class="mono">#{{ f.id }}（{{ f.message }}）</span>
          <button class="btn btn-sm btn-outline" type="button" @click="retryFailed">{{ t('admin.inbox.batchRetry', '重试失败项') }}</button>
        </div>
      </template>
    </div>

    <!-- M2-t4：待处理视图按 kind 分节+多选；其余状态保持平铺只读 -->
    <template v-if="kindGroups">
      <section v-for="[kindKey, rows] in kindGroups" :key="kindKey" class="inbox-kind-section">
        <header class="inbox-kind-head">
          <b>{{ inboxKindLabel(kindKey) }}</b>
          <span class="mini-stat"><b>{{ rows.length }}</b> {{ t('admin.inbox.total', '条待处理') }}</span>
          <button class="btn btn-sm btn-outline" type="button" @click="toggleKind(kindKey)">
            {{ kindAllSelected(kindKey) ? t('admin.inbox.deselectKind', '取消全选') : t('admin.inbox.selectAll', '全选本节') }}
          </button>
        </header>
        <article v-for="s in rows" :key="s.id" class="inbox-row card card-default" :class="{ 'inbox-picked': selected.has(s.id) }">
          <div class="inbox-head">
            <label class="inbox-check">
              <input type="checkbox" :checked="selected.has(s.id)" @change="toggle(s.id)" />
              <span class="cluster-badge cb-exact">{{ KIND_LABELS[s.kind]?.[0] || s.kind }}</span>
            </label>
            <span class="inbox-source mono">{{ s.source }}</span>
            <span v-if="s.confidence != null" class="mini-stat"><b>{{ (s.confidence * 100).toFixed(0) }}%</b> {{ t('admin.inbox.confidence', '置信度') }}</span>
            <span v-if="status === 'pending' && s.confidence != null && s.confidence < reviewFloor" class="hint">
              {{ t('admin.inbox.belowFloor', '低于默认阈值，仅显式筛出时可见') }}
            </span>
            <span class="muted mono inbox-time">{{ parseDate(s.created_at).toLocaleString('zh-CN') }}</span>
          </div>
          <div class="inbox-brief">{{ brief(s) }}</div>
          <div class="filter-row" style="margin: 8px 0 0">
            <span class="hint">{{ effectOf(s) }}</span>
            <template v-if="s.status === 'pending'">
              <button class="btn btn-sm btn-primary" type="button" :disabled="busy[s.id]" @click="review(s, 'approve')">
                {{ busy[s.id] ? t('admin.inbox.working', '执行中…') : t('admin.inbox.approve', '批准') }}
              </button>
              <button class="btn btn-sm btn-dark" type="button" :disabled="busy[s.id]" @click="review(s, 'reject')">
                {{ t('admin.inbox.reject', '驳回') }}
              </button>
            </template>
            <span v-else class="cluster-covered-tag">{{ s.status === 'approved' ? t('admin.inbox.approved', '已批准') : t('admin.inbox.rejected', '已驳回') }}</span>
          </div>
        </article>
      </section>
    </template>
    <div v-else class="inbox-list">
      <article v-for="s in items" :key="s.id" class="inbox-row card card-default">
        <div class="inbox-head">
          <span class="cluster-badge cb-exact">{{ KIND_LABELS[s.kind]?.[0] || s.kind }}</span>
          <span class="inbox-source mono">{{ s.source }}</span>
          <span v-if="s.confidence != null" class="mini-stat"><b>{{ (s.confidence * 100).toFixed(0) }}%</b> {{ t('admin.inbox.confidence', '置信度') }}</span>
          <span class="muted mono inbox-time">{{ parseDate(s.created_at).toLocaleString('zh-CN') }}</span>
        </div>
        <div class="inbox-brief">{{ brief(s) }}</div>
        <div class="filter-row" style="margin: 8px 0 0">
          <span class="hint">{{ effectOf(s) }}</span>
          <template v-if="s.status === 'pending'">
            <button class="btn btn-sm btn-primary" type="button" :disabled="busy[s.id]" @click="review(s, 'approve')">
              {{ busy[s.id] ? t('admin.inbox.working', '执行中…') : t('admin.inbox.approve', '批准') }}
            </button>
            <button class="btn btn-sm btn-dark" type="button" :disabled="busy[s.id]" @click="review(s, 'reject')">
              {{ t('admin.inbox.reject', '驳回') }}
            </button>
          </template>
          <span v-else class="cluster-covered-tag">{{ s.status === 'approved' ? t('admin.inbox.approved', '已批准') : t('admin.inbox.rejected', '已驳回') }}</span>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* ---- M2-t4 批量消化（admin scoped 纪律：styles/ 零新增块）---- */
/* kind 分节头：节名+计数+全选（44px 触达线内按钮复用 btn-sm 既有触达） */
.inbox-kind-section {
  margin-bottom: 22px;
}
.inbox-kind-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: var(--border-w, 4px) solid var(--ink, #000);
  margin-bottom: 12px;
}
/* 勾选框：行首 18px 可点目标包 44px 热区（触达线） */
.inbox-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  min-height: 44px;
}
.inbox-check input {
  width: 18px;
  height: 18px;
  accent-color: var(--ink, #000);
  cursor: pointer;
}
.inbox-picked {
  border-color: var(--yellow, #ffe66d);
}
/* 批量工具条：选中即现；失败列表逐条可重试 */
.inbox-batch {
  margin-bottom: 16px;
}
.inbox-failed {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 2px solid var(--ink, #000);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
</style>