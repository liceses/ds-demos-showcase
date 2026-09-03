<script setup lang="ts">
// 治理巡检（B4）：把结构性缺口列成待办。
// 三类级别：action（能一键生成候选）/ warn（只能人看）/ info（背景读数）。
// 关键克制：**没有自动补救动作的项就不给按钮** —— 造假动作比没有动作更坏。
defineOptions({ name: 'AdminInspectionSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import type { InspectionResult } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import LoadingRow from '../LoadingRow.vue'
import { t } from '../../i18n'

const ui = useUiStore()

const data = ref<InspectionResult | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref<Record<string, boolean>>({})
const minConfidence = ref(0.85) // 补值是猜测，门槛比拆分流水线更高；多值收敛是机械判断不受此限

const LEVEL_LABEL: Record<string, string> = {
  action: '可生成候选',
  warn: '需人工看',
  info: '读数',
}
const LEVEL_CLASS: Record<string, string> = {
  action: 'cb-exact',
  warn: 'cb-similar',
  info: 'cb-info',
}

const actionable = computed(() => (data.value?.checks || []).filter((c) => c.can_queue && c.count > 0))
const watchList = computed(() => (data.value?.checks || []).filter((c) => !c.can_queue && c.count > 0))

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.getInspection({ sample_limit: 6 })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function queue(id: string, label: string, n: number) {
  const ok = await ui.confirm({
    title: t('admin.inspect.confirmTitle', '生成候选？'),
    message: t('admin.inspect.confirmMsg', '「{label}」约 {n} 项将生成待批准候选进入收件箱；在你批准之前不会改动任何数据。', { label, n }),
    confirmText: t('admin.inspect.doQueue', '生成候选'),
  })
  if (!ok) return
  busy.value[id] = true
  try {
    const r = await api.queueInspection(id, minConfidence.value)
    ui.toast(t('admin.inspect.queued', '入队 {q} 条（建议 {p} 条，重复已去）', { q: r.queued, p: r.proposed }), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value[id] = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
      <span class="filter-label">{{ t('admin.inspect.hint', '巡检只列待办与生成候选，改数据一律走收件箱人工批准。') }}</span>
      <label class="filter-row" style="margin: 0; gap: 6px">
        <span class="muted">{{ t('admin.inspect.minConf', '补值置信度 ≥') }}</span>
        <input v-model.number="minConfidence" class="input" type="number" step="0.05" min="0" max="1" style="max-width: 92px" />
      </label>
      <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>
      <RouterLink class="btn btn-sm btn-outline" to="/admin">{{ t('admin.inspect.gotoInbox', '去收件箱批准 →') }}</RouterLink>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading" :text="t('admin.inspect.loading', '巡检中…')" />

    <template v-if="data && !loading">
      <p class="muted" style="margin-top: 0">
        {{ t('admin.inspect.scanned', '已上架 {n} 件作品', { n: data.approved }) }} ·
        {{ t('admin.inspect.findings', '共 {n} 处待办', { n: data.total_findings }) }}
      </p>

      <div class="section-head">
        <h2 class="section-title">{{ t('admin.inspect.actionTitle', '可处理') }}</h2>
      </div>
      <div v-if="!actionable.length" class="empty-box">{{ t('admin.inspect.noAction', '没有可自动处理的问题 —— 干净') }}</div>
      <div v-else class="inspect-list">
        <article v-for="c in actionable" :key="c.id" class="card card-default inspect-row">
          <div class="inspect-head">
            <span class="cluster-badge" :class="LEVEL_CLASS[c.level]">{{ LEVEL_LABEL[c.level] }}</span>
            <b>{{ c.label }}</b>
            <span class="inspect-count">{{ c.count }}</span>
            <span v-if="c.rate != null" class="muted">({{ (c.rate * 100).toFixed(0) }}%)</span>
            <span v-if="c.fixable != null" class="mini-stat"><b>{{ c.fixable }}</b> {{ t('admin.inspect.fixable', '可自动修') }}</span>
            <button class="btn btn-sm btn-primary" type="button" :disabled="busy[c.id]" @click="queue(c.id, c.label, c.count)">
              {{ busy[c.id] ? t('admin.inspect.working', '生成中…') : t('admin.inspect.queueBtn', '生成候选') }}
            </button>
          </div>
          <p class="hint" style="margin: 6px 0 0">{{ c.hint }}</p>
          <div v-if="c.samples?.length" class="inspect-samples mono">
            <span v-for="(s, i) in c.samples" :key="i">
              {{ (s.title as string) || (s.value as string) || (s.slug as string) }}<span v-if="s.types">[{{ (s.types as string[]).join('+') }}]</span>
            </span>
          </div>
        </article>
      </div>

      <div class="section-head" style="margin-top: 24px">
        <h2 class="section-title">{{ t('admin.inspect.watchTitle', '只能人工处理 / 背景读数') }}</h2>
      </div>
      <div v-if="!watchList.length" class="empty-box">{{ t('admin.inspect.noWatch', '没有其它待办') }}</div>
      <table v-else class="refine-table">
        <thead>
          <tr>
            <th>{{ t('admin.inspect.thLevel', '级别') }}</th>
            <th>{{ t('admin.inspect.thLabel', '检查项') }}</th>
            <th>{{ t('admin.inspect.thCount', '数量') }}</th>
            <th>{{ t('admin.inspect.thHint', '说明') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in watchList" :key="c.id">
            <td><span class="cluster-badge" :class="LEVEL_CLASS[c.level]">{{ LEVEL_LABEL[c.level] }}</span></td>
            <td><b>{{ c.label }}</b></td>
            <td class="mono">{{ c.count }}<span v-if="c.rate != null" class="muted"> / {{ (c.rate * 100).toFixed(0) }}%</span></td>
            <td class="muted">{{ c.hint }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>
