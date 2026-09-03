<script setup lang="ts">
// 治理收件箱（v2 B4′ 最小版）：所有知识变更建议都从这里过一遍人工。
// 规则：approve 才由后端 service 真正执行（挂题/建实体/合并），本面板不改任何本地状态猜测。
defineOptions({ name: 'AdminInboxSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import type { SuggestionItem } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import { parseDate } from '../../utils/time'
import LoadingRow from '../LoadingRow.vue'
import EmptyBox from '../EmptyBox.vue'
import { t } from '../../i18n'

const ui = useUiStore()

const items = ref<SuggestionItem[]>([])
const counts = ref<Record<string, number>>({})
const reviewFloor = ref(0.6)
const status = ref<'pending' | 'approved' | 'rejected' | 'all'>('pending')
const kind = ref('')
const loading = ref(false)
const busy = ref<Record<number, boolean>>({})
const error = ref('')

const KIND_LABELS: Record<string, [string, string]> = {
  task_match: ['挂题请求', 'attach task'],
  new_model: ['新模型', 'new model'],
  new_task: ['新题目', 'new task'],
  merge_model: ['模型合并', 'merge model'],
  merge_task: ['题目合并', 'merge task'],
  alias: ['别名归一', 'alias'],
  retag_demo: ['类型细分', 'refine type'],
}

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

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.listSuggestions({ status: status.value, kind: kind.value || undefined })
    items.value = res.items
    counts.value = res.pending_by_kind
    reviewFloor.value = res.thresholds.review
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
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

onMounted(load)
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

    <div v-else class="inbox-list">
      <article v-for="s in items" :key="s.id" class="inbox-row card card-default">
        <div class="inbox-head">
          <span class="cluster-badge cb-exact">{{ KIND_LABELS[s.kind]?.[0] || s.kind }}</span>
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
    </div>
  </div>
</template>
