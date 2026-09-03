<script setup lang="ts">
// 合并向导（B4）：治理铁律是「先 dry_run 看影响面，确认后才真合」。
// 界面按这个顺序强制走：选源 → 选目标 → 预览 → 执行。预览不出来的按钮一律禁用。
defineOptions({ name: 'AdminMergeSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import type { ConflictGroup, EntityConflicts, MergeHistoryItem, MergePreview, UnmergePreview } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import EntityPicker from './EntityPicker.vue'
import LoadingRow from '../LoadingRow.vue'
import { t } from '../../i18n'

const ui = useUiStore()

const kind = ref<'models' | 'tasks'>('models')
const source = ref<{ id: number; label: string } | null>(null)
const target = ref<{ id: number; label: string } | null>(null)
const preview = ref<MergePreview | null>(null)
const conflicts = ref<EntityConflicts | null>(null)
const history = ref<MergeHistoryItem[]>([])
const unPrev = ref<Record<number, UnmergePreview>>({})
const unBusy = ref<Record<number, boolean>>({})
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const reason = ref('')

const KIND_PATH = computed(() => (kind.value === 'models' ? 'models' : 'tasks'))
const canPreview = computed(() => !!source.value && !!target.value)
const conflictGroups = computed(() => (kind.value === 'models' ? conflicts.value?.models : conflicts.value?.tasks) || [])

function reset() {
  source.value = null
  target.value = null
  preview.value = null
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [c, h] = await Promise.all([api.getEntityConflicts(), api.getMergeHistory()])
    conflicts.value = c
    history.value = h.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function previewUnmerge(item: MergeHistoryItem) {
  unBusy.value[item.source.id] = true
  try {
    unPrev.value[item.source.id] = await api.unmergeEntity(item.source.id, { dry_run: true })
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    unBusy.value[item.source.id] = false
  }
}

async function doUnmerge(item: MergeHistoryItem) {
  const p = unPrev.value[item.source.id]
  if (!p) return
  const ok = await ui.confirm({
    title: t('admin.merge.unconfirmTitle', '确认撤销这次合并？'),
    message: p.reliable
      ? t('admin.merge.unconfirmMsg', '将把 {n} 个作品引用从「{g}」迁回「{s}」，源实体恢复为 {st}。', { n: p.will_restore, g: p.target.name || p.target.title || '', s: p.source.name || p.source.title || '', st: p.restored_status })
      : t('admin.merge.unconfirmWeak', '这次合并没留下迁移动清单（早期数据），撤销只能恢复实体本身，作品仍留在归宿 —— 不会替你猜哪些是它的。', {}),
    confirmText: t('admin.merge.unDoIt', '撤销合并'),
  })
  if (!ok) return
  unBusy.value[item.source.id] = true
  try {
    await api.unmergeEntity(item.source.id, { dry_run: false, reason: '管理端撤销合并' })
    ui.toast(t('admin.merge.unDone', '已撤销，迁回 {n} 个引用', { n: p.will_restore }), 'success')
    delete unPrev.value[item.source.id]
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    unBusy.value[item.source.id] = false
  }
}

function fillFromConflict(g: ConflictGroup) {
  // 冲突组里引用最多的那个作归宿，其余作源（与迁移脚本同一判据）
  const sorted = [...g.items].sort((a, b) => b.demos - a.demos)
  target.value = { id: sorted[0].id, label: sorted[0].label }
  source.value = { id: sorted[1].id, label: sorted[1].label }
  preview.value = null
}

async function doPreview() {
  if (!source.value || !target.value) return
  busy.value = true
  error.value = ''
  try {
    preview.value = await api.mergeEntity(KIND_PATH.value, String(source.value.id), {
      target_id: target.value.id,
      dry_run: true,
      reason: reason.value,
    })
  } catch (e) {
    preview.value = null
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function doMerge() {
  if (!preview.value || !source.value) return
  const ok = await ui.confirm({
    title: t('admin.merge.confirmTitle', '确认执行合并？'),
    message: t(
      'admin.merge.confirmMsg',
      '将把「{s}」的 {n} 个作品引用迁到「{g}」，源实体退役、旧名成为别名。此操作有审计、可回溯但不能一键撤销。',
      { s: preview.value.source.name || preview.value.source.title || '', n: preview.value.affected_demos, g: preview.value.target.name || preview.value.target.title || '' },
    ),
    confirmText: t('admin.merge.doIt', '执行合并'),
  })
  if (!ok) return
  busy.value = true
  try {
    const r = await api.mergeEntity(KIND_PATH.value, String(source.value.id), {
      target_id: target.value!.id,
      dry_run: false,
      reason: reason.value,
    })
    ui.toast(t('admin.merge.done', '已合并，迁移 {n} 个作品引用', { n: r.affected_demos }), 'success')
    reset()
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
      <span class="filter-label">{{ t('admin.merge.hint', '合并 = 迁引用 + 旧名转别名 + 源退役，全程单事务且留审计。') }}</span>
      <select v-model="kind" class="input" style="max-width: 130px" @change="reset">
        <option value="models">{{ t('admin.merge.kindModel', '模型实体') }}</option>
        <option value="tasks">{{ t('admin.merge.kindTask', '题目实体') }}</option>
      </select>
      <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>
    </div>

    <LoadingRow v-if="loading" :text="t('admin.merge.loading', '扫描冲突中…')" />

    <template v-else>
      <div v-if="error" class="notice notice-error">{{ error }}</div>

      <div v-if="conflictGroups.length" class="card card-mint" style="padding: 12px 16px; margin-bottom: 14px">
        <b>{{ t('admin.merge.conflictTitle', '规范化同名冲突（该合的就是这些）') }}</b>
        <p class="hint" style="margin: 4px 0 8px">
          {{ t('admin.merge.conflictWhy', '匹配层会把大小写与分隔符吃掉：两个实体规范化后同键，第三种写法就会分叉到不同实体上。') }}
        </p>
        <div v-for="g in conflictGroups" :key="g.key" class="merge-conflict-row">
          <code class="mono">{{ g.key }}</code>
          <span v-for="it in g.items" :key="it.id" class="tag-chip mode-open">{{ it.label }}<span class="count">{{ it.demos }}</span></span>
          <button class="btn btn-sm btn-outline" type="button" @click="fillFromConflict(g)">{{ t('admin.merge.fill', '填入向导') }}</button>
        </div>
      </div>
      <p v-else class="hint" style="margin-top: 0">
        {{ t('admin.merge.noConflict', '没有规范化同名的实体冲突 —— 需要合并时也可以手动选两个实体。') }}
      </p>

      <div class="merge-cols">
        <div class="card card-default merge-col">
          <h3 class="archive-title">{{ t('admin.merge.step1', '① 源实体（被合并、将退役）') }}</h3>
          <p v-if="source" class="merge-picked mono">{{ source.label }}</p>
          <EntityPicker :kind="kind" :selected-id="source?.id" :exclude-id="target?.id" @pick="(p) => { source = p; preview = null }" />
        </div>
        <div class="card card-default merge-col">
          <h3 class="archive-title">{{ t('admin.merge.step2', '② 归宿实体（保留）') }}</h3>
          <p v-if="target" class="merge-picked mono">{{ target.label }}</p>
          <EntityPicker :kind="kind" :selected-id="target?.id" :exclude-id="source?.id" @pick="(p) => { target = p; preview = null }" />
        </div>
      </div>

      <label class="field" style="margin-top: 12px">
        {{ t('admin.merge.reasonLabel', '合并理由（进审计，建议写清依据）') }}
        <input v-model="reason" class="input" maxlength="500" :placeholder="t('admin.merge.reasonPh', '如：官方确认 dsv4flash 与 dsv4-flash 是同一型号')" />
      </label>

      <div class="filter-row" style="margin-top: 12px">
        <button class="btn btn-primary" type="button" :disabled="!canPreview || busy" @click="doPreview">
          {{ t('admin.merge.previewBtn', '③ 预览影响面（dry_run）') }}
        </button>
        <button class="btn btn-dark" type="button" :disabled="!preview || busy" @click="doMerge">
          {{ busy ? t('admin.merge.busy', '执行中…') : t('admin.merge.mergeBtn', '④ 执行合并') }}
        </button>
        <button v-if="source || target || preview" class="btn btn-outline" type="button" @click="reset">{{ t('common.reset', '重置') }}</button>
      </div>

      <div v-if="preview" class="card card-yellow merge-preview">
        <b>{{ t('admin.merge.previewTitle', '影响面预览（未写库）') }}</b>
        <div class="merge-kpis">
          <div><span class="kpi-label">{{ t('admin.merge.kpiDemos', '将迁移作品') }}</span><b class="kpi-num">{{ preview.affected_demos }}</b></div>
          <div v-if="preview.aliases_moved != null"><span class="kpi-label">{{ t('admin.merge.kpiAlias', '随迁别名') }}</span><b class="kpi-num">{{ preview.aliases_moved }}</b></div>
          <div><span class="kpi-label">{{ t('admin.merge.kpiSource', '源') }}</span><b>{{ preview.source.name || preview.source.title }}</b><span class="muted mono"> #{{ preview.source.id }}</span></div>
          <div><span class="kpi-label">{{ t('admin.merge.kpiTarget', '归宿') }}</span><b>{{ preview.target.name || preview.target.title }}</b><span class="muted mono"> #{{ preview.target.id }}</span></div>
        </div>
        <p class="hint" style="margin: 8px 0 0">
          {{ t('admin.merge.previewFoot', '执行后源实体状态转 deprecated、其公开页不再出现，旧名会自动成为归宿实体的别名以继续匹配历史标签。') }}
        </p>
      </div>

      <!-- 可撤销的合并：撤销同样必须先 dry_run（合并之后可能又做过归属，直接撤会踩掉后来的决定） -->
      <div class="section-head" style="margin-top: 26px">
        <h2 class="section-title">{{ t('admin.merge.histTitle', '可撤销的合并') }}</h2>
        <span class="mini-stat"><b>{{ history.length }}</b> {{ t('admin.merge.histN', '条') }}</span>
      </div>
      <p v-if="!history.length" class="muted">{{ t('admin.merge.histEmpty', '没有处于「已被合并」状态的实体') }}</p>
      <table v-else class="refine-table">
        <thead>
          <tr>
            <th>{{ t('admin.merge.thSrc', '源（已退役）') }}</th>
            <th>{{ t('admin.merge.thDst', '归宿') }}</th>
            <th>{{ t('admin.merge.thMoved', '当初迁走 / 可迁回') }}</th>
            <th>{{ t('admin.merge.thReason', '当时理由') }}</th>
            <th style="width: 190px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in history" :key="h.source.id">
            <td><b>{{ h.source.name || h.source.title }}</b><code class="mono muted"> {{ h.source.slug }}</code></td>
            <td>{{ h.target?.name || h.target?.title || '—' }}</td>
            <td class="mono">
              {{ h.moved_total }} / {{ h.movable_back }}
              <span v-if="!h.reliable" class="stat stat-red">{{ t('admin.merge.noEvidence', '无迁移清单') }}</span>
            </td>
            <td class="muted audit-reason">{{ h.reason || '—' }}</td>
            <td>
              <div class="filter-row" style="margin: 0">
                <button class="btn btn-sm btn-outline" type="button" :disabled="unBusy[h.source.id]" @click="previewUnmerge(h)">
                  {{ t('admin.merge.unPreview', '预览影响') }}
                </button>
                <button class="btn btn-sm btn-danger" type="button" :disabled="!unPrev[h.source.id] || unBusy[h.source.id]" @click="doUnmerge(h)">
                  {{ t('admin.merge.unDo', '撤销') }}
                </button>
              </div>
              <p v-if="unPrev[h.source.id]" class="hint" style="margin: 6px 0 0">
                <template v-if="unPrev[h.source.id].reliable">
                  {{ t('admin.merge.unWillRestore', '将迁回 {n} 个；另有 {m} 个已被后续操作改走，不动它们。', { n: unPrev[h.source.id].will_restore, m: unPrev[h.source.id].already_moved_away }) }}
                </template>
                <template v-else>{{ t('admin.merge.unWeak', '只能恢复实体本身（作品留在归宿），因为当初没记清单。') }}</template>
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>


