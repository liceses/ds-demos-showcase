<script setup lang="ts">
// 通用「搜索即选」实体选择器基座（07 §1.2 / 08 §4 T5·M5-F2 收编 admin/EntityPicker 语义并上提）：
// 交互：输入即触发（非回车提交）——250ms 防抖 + 请求序号竞态守卫（慢响应整包丢弃）；
//       ⇅ 移动高亮（循环） / ↵ 确认高亮项 / Esc 关闭并还原焦点；aria combobox/listbox/option。
// 形态：mode=dropdown（输入框 + 浮层，定位跟随输入框；面板=无边框纯色 + 入场 b-stamp-drop，零倾斜）；
//       mode=inline（内联结果列表——存量 admin 面板（合并/别名/公告）同款形态，零 churn）。
// 多选：chips 回显（tag-chip 语汇 + ×）；v-model 输出 id+slug+label（EntityPick）。
// 纪律：条目/输入 ≥44px、meta mono tabular、scoped、reduced-motion 退场、i18n 双语；组件内零圆角/渐变/软影/旋转。
defineOptions({ name: 'EntityPicker' })
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { t } from '../../i18n'
import { searchEntities, normalizeKind, type EntityPick, type PickerKind, type PickerSource } from './pickerSources'

const props = withDefaults(
  defineProps<{
    kind: PickerKind
    /** 数据面：admin（默认，合并/别名/公告等后台）/ public（上传等公开面） */
    source?: PickerSource
    /** dropdown=输入框+浮层（默认）；inline=内联结果列表 */
    mode?: 'dropdown' | 'inline'
    multiple?: boolean
    /** 这个 id 不允许被选（防止把 A 合进 A） */
    excludeId?: number | null
    /** 已选中的实体 id（高亮标记，单选场景由消费方驱动） */
    selectedId?: number | null
    placeholder?: string
    autofocus?: boolean
    /** demo 变体：空态给「按 slug 精确匹配」手动确认出口 */
    manualSlug?: boolean
  }>(),
  { source: 'admin', mode: 'dropdown', multiple: false, excludeId: null, selectedId: null, placeholder: '', autofocus: false, manualSlug: false },
)
const model = defineModel<EntityPick | EntityPick[] | null>({ default: null })
const emit = defineEmits<{
  pick: [p: EntityPick]
  remove: [p: EntityPick]
}>()

const kind = computed(() => normalizeKind(props.kind))
const multi = computed(() => props.multiple)

// ---- 选中态（chips 回显 + v-model）----
const selection = computed<EntityPick[]>(() => {
  if (!multi.value) return model.value && !Array.isArray(model.value) ? [model.value] : []
  return Array.isArray(model.value) ? model.value : []
})
const pickedKey = (p: EntityPick) => `${p.id ?? 's'}:${p.slug ?? p.label}`
function contains(p: EntityPick) {
  return selection.value.some((x) => pickedKey(x) === pickedKey(p))
}
function isSelectedRow(p: EntityPick) {
  if (multi.value) return contains(p)
  return props.selectedId != null ? props.selectedId === p.id : contains(p)
}
function commitPick(p: EntityPick) {
  const picked: EntityPick = { id: p.id ?? null, slug: p.slug ?? null, label: p.label, meta: p.meta }
  if (p.status) picked.status = p.status
  if (multi.value) {
    if (!contains(p)) model.value = [...selection.value, picked]
    emit('pick', picked)
    q.value = ''
    hasQuery.value = false
    void focusInput()
  } else {
    model.value = picked
    emit('pick', picked)
    q.value = ''
    hasQuery.value = false
    closePanel()
  }
  void refresh()
}
function removePick(p: EntityPick) {
  if (multi.value) {
    model.value = selection.value.filter((x) => pickedKey(x) !== pickedKey(p))
  } else {
    model.value = null
  }
  emit('remove', p)
}
function clearAll() {
  model.value = multi.value ? [] : null
  emit('remove', selection.value[0] as EntityPick)
}

// ---- 搜索状态（防抖 250ms + 序号守卫，复用 SearchOverlay 已验证模式）----
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
/** 页面可能同挂多个选择器（合并向导 source/target 等），结果列表 id 必须唯一 */
const listId = `ep-list-${useId()}`
const q = ref('')
const hasQuery = ref(false)
const rows = ref<EntityPick[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const opened = ref(false)
const activeIdx = ref(-1)
const slugFallbackDone = ref(false)
const debouncing = ref(false)

let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

// T7 走查实锤修复：excludeId 缺省 null，而公开 demo 行 id 恒 null（契约无数字 id）——
// 旧写法 x.id !== excludeId(null) 会把所有 demo 行滤空（列表空但 total=1，「搜索即选」断链）。
// 新语义：excludeId 未给 → 全量展示；给了 → 只剔除 id 精确匹配的行（未知 id 行不误杀）。
const visible = computed(() =>
  props.excludeId == null ? rows.value : rows.value.filter((x) => x.id !== props.excludeId),
)
const kindKey = computed(() => kind.value)

function closePanel() {
  opened.value = false
  activeIdx.value = -1
}
function openPanel() {
  opened.value = true
}
function focusInput() {
  void nextTick(() => inputEl.value?.focus())
}

const emptyText = computed(() => {
  const k = kindKey.value
  const map: Record<string, string> = {
    demo: t('entityPicker.noResultDemo', '没有匹配的已上架作品'),
    model: t('entityPicker.noResultModel', '没有匹配的模型'),
    task: t('entityPicker.noResultTask', '没有匹配的题目'),
    topic: t('entityPicker.noResultTopic', '没有匹配的主题'),
    tag: t('entityPicker.noResultTag', '没有匹配的标签'),
  }
  return map[k] || t('entityPicker.none', '没有匹配实体')
})

async function run() {
  const my = ++seq
  const term = q.value.trim()
  loading.value = true
  error.value = ''
  debouncing.value = false
  try {
    const out = await searchEntities(kind.value, term, props.source)
    if (my !== seq) return // 竞态守卫：过期响应整包丢弃
    rows.value = out.rows
    total.value = out.total
    slugFallbackDone.value = !!out.slugFallback
    if (out.rows.length) activeIdx.value = 0
    else activeIdx.value = -1
    if (props.mode === 'dropdown' && term) openPanel()
  } catch (e) {
    if (my !== seq) return
    error.value = (e as Error).message
    rows.value = []
    total.value = 0
    activeIdx.value = -1
  } finally {
    if (my === seq) loading.value = false
  }
}

function schedule() {
  if (timer) clearTimeout(timer)
  debouncing.value = true
  timer = setTimeout(run, 250)
}

async function refresh(openWhenDone = false) {
  // 初载 / kind 切换 / 输入清空：直接拉最近一批（不防抖），让空态也有可选项
  const my = ++seq
  q.value = ''
  hasQuery.value = false
  loading.value = true
  error.value = ''
  try {
    const out = await searchEntities(kind.value, '', props.source)
    if (my !== seq) return
    rows.value = out.rows
    total.value = out.total
    activeIdx.value = out.rows.length ? 0 : -1
    if (props.mode === 'dropdown') {
      if (out.rows.length && openWhenDone) openPanel()
      else closePanel()
    }
  } catch (e) {
    if (my !== seq) return
    error.value = (e as Error).message
  } finally {
    if (my === seq) loading.value = false
  }
}

function onInput() {
  hasQuery.value = q.value.trim().length > 0
  if (!hasQuery.value) {
    if (timer) clearTimeout(timer)
    void refresh()
    return
  }
  debouncing.value = false
  schedule()
}

function manualSlugPick() {
  const v = q.value.trim()
  if (!v) return
  commitPick({ id: null, slug: v, label: v, meta: t('entityPicker.manualSlugMeta', '手动 slug') })
}

// ---- 键盘（⇅↵Esc；dropdown 焦点在输入框内循环高亮）----
function onKeydown(e: KeyboardEvent) {
  const list = visible.value
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!list.length) return
    e.preventDefault()
    const n = list.length
    activeIdx.value = e.key === 'ArrowDown' ? (activeIdx.value + 1) % n : (activeIdx.value - 1 + n) % n
    const el = listEl.value?.querySelector<HTMLElement>(`[data-pk="${activeIdx.value}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'Enter') {
    if (debouncing.value || loading.value) return
    const pick = activeIdx.value >= 0 ? visible.value[activeIdx.value] : null
    if (pick) {
      e.preventDefault()
      commitPick(pick)
    }
  } else if (e.key === 'Escape') {
    closePanel()
    inputEl.value?.blur()
  }
}

watch(
  () => props.kind,
  () => {
    closePanel()
    void refresh()
  },
)
watch(
  () => props.source,
  () => {
    closePanel()
    void refresh()
  },
)

function onFocus() {
  if (props.mode !== 'dropdown' || opened.value) return
  if (hasQuery.value) {
    openPanel() // 还原焦点时保留当前词与结果
  } else if (rows.value.length) {
    openPanel()
  } else {
    void refresh(true)
  }
}

onMounted(() => {
  if (props.autofocus) focusInput()
  void refresh()
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="picker" role="combobox" :aria-expanded="mode === 'inline' || opened" aria-haspopup="listbox">
    <div v-if="selection.length && multi" class="picker-chips">
      <span v-for="p in selection" :key="pickedKey(p)" class="tag-chip active picker-chip">
        {{ p.label }}
        <button type="button" class="picker-x" :aria-label="t('entityPicker.unpick', '取消选择')" @click="removePick(p)">✕</button>
      </span>
      <span v-if="multi && selection.length" class="hint picker-clear">
        <button type="button" class="btn btn-sm btn-ghost" @click="clearAll">{{ t('entityPicker.clear', '清空') }}</button>
      </span>
    </div>

    <div class="picker-box">
      <input
        ref="inputEl"
        v-model="q"
        class="input picker-input"
        type="search"
        :placeholder="placeholder || t('entityPicker.ph', '搜索名称 / 题面…')"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="mode === 'inline' || opened"
        :aria-controls="listId"
        aria-activedescendant=""
        @focus="onFocus"
        @input="onInput"
        @keydown="onKeydown"
      />
      <span class="muted mono picker-total">{{ loading ? '…' : total }}</span>
    </div>

    <!-- dropdown 浮层：紧随输入框的定位面板（纯色无边框 + b-stamp-drop 入场；零旋转） -->
    <div v-if="mode === 'dropdown' && opened" class="picker-panel">
      <template v-if="!loading">
        <div v-if="error" class="notice notice-error picker-error">
          {{ error }}
          <button type="button" class="btn btn-sm btn-outline" style="margin-left: 8px" @click="run">{{ t('entityPicker.retry', '重试') }}</button>
        </div>
        <ul v-if="visible.length" :id="listId" ref="listEl" class="picker-list" role="listbox" :aria-label="t('entityPicker.results', '搜索结果')">
          <li v-for="(x, i) in visible" :key="pickedKey(x)" :data-pk="i" role="option" :aria-selected="isSelectedRow(x)">
            <button type="button" class="picker-row" :class="{ active: isSelectedRow(x) }" @click="commitPick(x)">
              <span class="picker-label">{{ x.label }}</span>
              <span v-if="x.meta" class="mono picker-meta">{{ x.meta }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="picker-empty">
          {{ emptyText }}
          <template v-if="kindKey === 'demo' && hasQuery">
            <span class="picker-manual-hint"> — {{ t('entityPicker.manualSlugHint', '仍可按 slug 精确匹配') }}</span>
            <button v-if="manualSlug" type="button" class="btn btn-sm btn-secondary" @click="manualSlugPick">
              {{ t('entityPicker.manualSlug', '按 slug 使用「{q}」', { q: q.trim() }) }}
            </button>
          </template>
        </p>
      </template>
      <p v-else class="picker-loading"><span class="spinner"></span> {{ t('entityPicker.searching', '搜索中…') }}</p>
    </div>

    <!-- inline：内联结果列表（存量 admin 面板同款：直接列在输入框下） -->
    <div v-else-if="mode === 'inline'" class="picker-inline">
      <div v-if="loading && !rows.length" class="picker-loading"><span class="spinner"></span> {{ t('entityPicker.searching', '搜索中…') }}</div>
      <template v-else>
        <ul v-if="visible.length" :id="listId" ref="listEl" class="picker-list" role="listbox">
          <li v-for="(x, i) in visible" :key="pickedKey(x)" :data-pk="i" role="option" :aria-selected="isSelectedRow(x)">
            <button type="button" class="picker-row" :class="{ active: isSelectedRow(x) }" @click="commitPick(x)">
              <span class="picker-label">{{ x.label }}</span>
              <span v-if="x.meta" class="mono picker-meta">{{ x.meta }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="picker-empty">{{ emptyText }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 纪律：零圆角 / 零渐变 / 零软影 / 静止零旋转；命中区 ≥44px；meta mono tabular */
.picker {
  position: relative;
  font-family: var(--font-sans, sans-serif);
}
.picker-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.picker-input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
}
.picker-total {
  flex: none;
  font-size: 11px;
}
.picker-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.picker-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.picker-x {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  min-width: 26px;
  min-height: 26px;
}
.picker-clear {
  align-self: center;
}
/* 浮层三律形态：2px 实线描边 + 纯色底（不做 4px 硬影盒）；b-stamp-drop 入场由全局动效类提供时用 0ms 硬切兜底 */
.picker-panel {
  position: absolute;
  z-index: 60;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  background: var(--paper, #fff);
  border: 2px solid var(--line, #000);
  max-height: 320px;
  overflow: auto;
}
.picker-inline {
  max-height: 320px;
  overflow: auto;
  margin-bottom: 6px;
}
.picker-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.picker-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  text-align: left;
  border: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
  background: transparent;
  color: var(--ink, #000);
  cursor: pointer;
  font-family: inherit;
}
.picker-row:last-child {
  border-bottom: none;
}
.picker-row:hover,
.picker-row.active {
  background: var(--ink, #000);
  color: var(--paper, #fff);
}
.picker-label {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-meta {
  flex: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}
.picker-empty,
.picker-loading {
  margin: 0;
  padding: 10px;
  font-size: 12px;
}
.picker-manual-hint {
  color: var(--ink-soft, #666);
}
.picker-error {
  margin: 8px;
}
</style>
