<script setup lang="ts">
// 归属工作台（Q2 第三步）：把挂在兜底位（未标注 / 未定型号 / 灰测）的作品迁回真实型号。
// 三条硬规矩：
// 1) 目标只能是已确认的真实型号 —— 兜底位之间该走实体合并，不该走归属；
// 2) 后端归属会回写 model 标签（只改实体表会在作者下次编辑时静默退回兜底位）；
// 3) 提交前必须看到影响面（多少个作品、从哪迁到哪），确认后才动手。
defineOptions({ name: 'AdminAttributionSection' })
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../../api'
import type { AttributionGroup, AttributionPending } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import LoadingRow from '../LoadingRow.vue'
import EmptyBox from '../EmptyBox.vue'
import EntityStamp from '../EntityStamp.vue'
import { modelDisplay } from '../../utils/modelDisplay'
import { t } from '../../i18n'

const ui = useUiStore()

const data = ref<AttributionPending | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref<Record<string, boolean>>({})
/** groupSlug -> 选中作品 id */
const picked = reactive<Record<string, Set<number>>>({})
/** groupSlug -> 目标型号 id */
const target = reactive<Record<string, number | null>>({})

const RES_LABELS: Record<string, [string, string]> = {
  unknown: ['未标注', 'unlabeled'],
  family: ['未定型号', 'model TBD'],
  guess: ['灰测未证实', 'canary'],
}

const totalPending = computed(() =>
  (data.value?.groups || []).reduce((n, g) => n + g.demos.length, 0),
)

/** 可选归属目标：只列已确认的真实型号（service 侧同样拒绝兜底位当目标） */
function targetsOf() {
  return (data.value?.targets || []).map((m) => ({
    ...m,
    label: m.vendor ? `${m.name} · ${m.vendor}` : m.name,
  }))
}

function selectedIds(slug: string): number[] {
  return [...(picked[slug] || [])]
}

function toggleAll(g: AttributionGroup) {
  const cur = picked[g.model.slug] || new Set<number>()
  const all = g.demos.every((d) => cur.has(d.id))
  picked[g.model.slug] = all ? new Set() : new Set(g.demos.map((d) => d.id))
}

function toggle(g: AttributionGroup, id: number) {
  const cur = picked[g.model.slug] || new Set<number>()
  const next = new Set(cur)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  picked[g.model.slug] = next
}

/** 组内多数猜测作为默认目标（有就填，没有留空，绝不自动乱选） */
function defaultTarget(g: AttributionGroup): number | null {
  const tally = new Map<number, number>()
  for (const d of g.demos) if (d.guess) tally.set(d.guess.id, (tally.get(d.guess.id) || 0) + 1)
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : null
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.getAttributionPending()
    for (const g of data.value.groups) {
      if (!(g.model.slug in picked)) picked[g.model.slug] = new Set()
      if (!(g.model.slug in target)) target[g.model.slug] = defaultTarget(g)
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function submit(g: AttributionGroup) {
  const ids = selectedIds(g.model.slug)
  const tid = target[g.model.slug]
  if (!ids.length) {
    ui.toast(t('admin.attr.pickFirst', '先勾选要归属的作品'), 'error')
    return
  }
  if (!tid) {
    ui.toast(t('admin.attr.pickTarget', '先选择归属到哪个型号'), 'error')
    return
  }
  const to = data.value?.targets.find((x) => x.id === tid)
  const ok = await ui.confirm({
    title: t('admin.attr.confirmTitle', '确认归属？'),
    message: t(
      'admin.attr.confirmMsg',
      '将把 {n} 个作品从「{from}」迁到「{to}」，同时回写 model 标签并留审计记录。',
      { n: ids.length, from: modelDisplay(g.model), to: to?.name || '' },
    ),
    confirmText: t('admin.attr.doIt', '归属'),
  })
  if (!ok) return
  busy.value[g.model.slug] = true
  try {
    const r = await api.attributeDemos({ demo_ids: ids, target_id: tid, reason: '管理端归属工作台' })
    ui.toast(t('admin.attr.done', '已归属 {n} 个作品', { n: r.moved }), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value[g.model.slug] = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
      <span class="filter-label">{{ t('admin.attr.hint', '兜底位不是终点：这里是把它们逐条迁回真实型号的工作台。') }}</span>
      <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>
      <span v-if="data" class="mini-stat"><b>{{ totalPending }}</b> {{ t('admin.attr.pendingN', '个作品待归属') }}</span>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading" :text="t('admin.attr.loading', '加载待归属清单…')" />
    <EmptyBox v-else-if="!data || !data.groups.length" :text="t('admin.attr.empty', '兜底位是空的 —— 没有待归属的作品')" />

    <div v-else class="attr-list">
      <article v-for="g in data.groups" :key="g.model.slug" class="card card-default attr-group">
        <header class="attr-head">
          <EntityStamp :name="g.model.name" :vendor="g.model.vendor" size="md" />
          <b class="attr-title">{{ modelDisplay(g.model) }}</b>
          <span class="cluster-badge cb-exact">{{ (RES_LABELS[g.model.resolution || 'unknown'] || [g.model.resolution])[0] }}</span>
          <span class="mini-stat"><b>{{ g.demos.length }}</b> {{ t('admin.attr.works', '个作品') }}</span>
          <RouterLink class="muted mono" :to="`/models/${g.model.slug}`" style="margin-left: auto">{{ g.model.slug }}</RouterLink>
        </header>

        <div class="attr-tools">
          <label class="attr-pick-all">
            <input type="checkbox" :checked="g.demos.length > 0 && selectedIds(g.model.slug).length === g.demos.length" @change="toggleAll(g)" />
            {{ t('admin.attr.selectAll', '全选') }}
          </label>
          <select v-model="target[g.model.slug]" class="input" style="max-width: 260px">
            <option :value="null">{{ t('admin.attr.chooseTarget', '归属到…') }}</option>
            <option v-for="o in targetsOf()" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
          <button
            class="btn btn-sm btn-primary"
            type="button"
            :disabled="busy[g.model.slug] || !selectedIds(g.model.slug).length"
            @click="submit(g)"
          >
            {{ busy[g.model.slug] ? t('admin.attr.working', '提交中…') : t('admin.attr.submit', '归属所选 {n}', { n: selectedIds(g.model.slug).length }) }}
          </button>
        </div>

        <ul class="attr-rows">
          <li v-for="d in g.demos" :key="d.id" class="attr-row">
            <input type="checkbox" :checked="selectedIds(g.model.slug).includes(d.id)" @change="toggle(g, d.id)" />
            <RouterLink class="attr-row-title" :to="`/demo/${d.slug}`" target="_blank">{{ d.title }}</RouterLink>
            <span v-if="d.guess" class="tag-chip mode-open">
              {{ t('admin.attr.guess', '疑似') }} {{ d.guess.name }}
            </span>
            <span v-if="d.model_hint" class="muted attr-hint">{{ d.model_hint }}</span>
            <span class="mono muted attr-rating">R {{ (d.rating_avg || 0).toFixed(1) }}/{{ d.rating_count }}</span>
          </li>
        </ul>
      </article>
    </div>
  </div>
</template>
