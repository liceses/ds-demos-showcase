<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '../api'
import { useUiStore } from '../stores/ui'
import type { TagKeyValue, TagMergeResult } from '../api/types'
import { groupedTagValues } from '../utils/tagGroups'
import { tagLabel } from '../utils/funMode'

const props = withDefaults(
  defineProps<{
    values: TagKeyValue[]
    mode?: 'display' | 'select' | 'admin'
    routeKey?: string
    selected?: string[]
    search?: string
    activeValue?: string
  }>(),
  { mode: 'display', routeKey: '', selected: () => [], search: '', activeValue: '' },
)

const emit = defineEmits<{ 'update:selected': [string[]]; changed: [] }>()
const ui = useUiStore()

const q = computed(() => props.search.trim().toLowerCase())
const hit = (v: string) => !!q.value && v.toLowerCase().includes(q.value)

// display/select 用厂商/group 猜测分组；admin 用真实 group，未分组单独列
const displayGroups = computed(() => groupedTagValues(props.values))
const adminGroups = computed(() => {
  const map = new Map<string, TagKeyValue[]>()
  for (const v of props.values) {
    const g = v.group || '未分组'
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(v)
  }
  return [...map.entries()].map(([group, items]) => ({ group, values: items }))
})

function visibleValues(values: TagKeyValue[]) {
  if (!q.value) return values
  return values.filter((v) => hit(v.value))
}

function isSelected(v: string) {
  return props.selected.includes(v)
}

function toggle(v: string) {
  const next = isSelected(v) ? props.selected.filter((x) => x !== v) : [...props.selected, v]
  emit('update:selected', next)
}

// ---------- admin ----------
const renameDraft = ref<Record<string, string>>({})
const addDraft = ref<Record<string, string>>({})
const mergeFrom = ref('')
const mergeTo = ref('')
const mergeResult = ref<TagMergeResult | null>(null)
const merging = ref(false)
const mergeError = ref('')

async function copyValue(v: TagKeyValue) {
  try {
    await navigator.clipboard.writeText(v.value)
    ui.toast(`已复制 ${v.value}`, 'success')
  } catch {
    /* 静默 */
  }
}

async function renameGroup(group: string) {
  const next = renameDraft.value[group]?.trim()
  if (!next || next === group || !props.routeKey) return
  try {
    await api.renameTagGroup(props.routeKey, group, next)
    ui.toast('分组已重命名', 'success')
    emit('changed')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function clearGroup(group: string) {
  const ok = await ui.confirm({ title: '清除分组', message: `确定清除「${group}」？`, confirmText: '清除', danger: true })
  if (!ok || !props.routeKey) return
  try {
    await api.clearTagGroup(props.routeKey, group)
    ui.toast('分组已清除', 'success')
    emit('changed')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function addToGroup(group: string) {
  const value = addDraft.value[group]?.trim()
  if (!value || !props.routeKey) return
  try {
    const existing = props.values.find((v) => v.value === value)
    if (existing) {
      if (existing.group !== group) {
        await api.setTagGroup(existing.id!, group)
      }
    } else {
      await api.createTag(props.routeKey, value, undefined, undefined, group)
    }
    addDraft.value[group] = ''
    ui.toast(`已加入「${group}」`, 'success')
    emit('changed')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function assignValue(v: TagKeyValue, group: string | null) {
  if (v.group === group) return
  try {
    await api.setTagGroup(v.id!, group)
    ui.toast('已更新', 'success')
    emit('changed')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
}

async function previewMerge() {
  mergeError.value = ''
  mergeResult.value = null
  if (!props.routeKey || !mergeFrom.value.trim() || !mergeTo.value.trim()) {
    mergeError.value = '请填写源值和目标值'
    return
  }
  try {
    mergeResult.value = await api.mergeTags({
      from_key: props.routeKey,
      from_value: mergeFrom.value.trim(),
      to_key: props.routeKey,
      to_value: mergeTo.value.trim(),
      dry_run: true,
    })
  } catch (e) {
    mergeError.value = (e as Error).message
  }
}

async function executeMerge() {
  if (!props.routeKey || !mergeResult.value) return
  merging.value = true
  try {
    await api.mergeTags({
      from_key: props.routeKey,
      from_value: mergeFrom.value.trim(),
      to_key: props.routeKey,
      to_value: mergeTo.value.trim(),
      dry_run: false,
    })
    ui.toast('合并完成', 'success')
    mergeResult.value = null
    mergeFrom.value = ''
    mergeTo.value = ''
    emit('changed')
  } catch (e) {
    mergeError.value = (e as Error).message
  } finally {
    merging.value = false
  }
}
</script>

<template>
  <div class="tag-group-box">
    <!-- 合成台（admin） -->
    <div v-if="mode === 'admin'" class="tag-merge-craft">
      <h3 style="margin: 0 0 10px">合并标签（合成台）</h3>
      <div class="filter-row" style="margin: 0; flex-wrap: wrap">
        <input v-model="mergeFrom" class="input" style="max-width: 140px" placeholder="源值" />
        <span class="tag-merge-plus">+</span>
        <input v-model="mergeTo" class="input" style="max-width: 140px" placeholder="目标值" />
        <span class="tag-merge-eq">=</span>
        <button class="btn btn-sm btn-secondary" type="button" :disabled="merging" @click="previewMerge">预览</button>
        <button v-if="mergeResult" class="btn btn-sm btn-danger" type="button" :disabled="merging" @click="executeMerge">执行</button>
      </div>
      <div v-if="mergeError" class="notice notice-error" style="margin-top: 8px">{{ mergeError }}</div>
      <div v-if="mergeResult" class="tag-merge-result" style="margin-top: 8px">
        <span class="tag-stat"><b>{{ mergeResult.merged }}</b> 迁移</span>
        <span class="tag-stat"><b>{{ mergeResult.removed_dups }}</b> 重复</span>
        <span class="tag-stat"><b>{{ mergeResult.affected_demos }}</b> Demo</span>
        <span class="tag-stat"><b>{{ mergeResult.deleted_source ? '是' : '否' }}</b> 删源</span>
      </div>
    </div>

    <!-- 组框 -->
    <div class="group-card-grid">
      <div
        v-for="g in (mode === 'admin' ? adminGroups : displayGroups)"
        :key="g.group"
        class="group-card"
        :class="{ 'group-card-ungrouped': g.group === '未分组' }"
      >
        <div class="group-card-head">
          <b>{{ g.group }}</b><span class="count">{{ g.values.length }}</span>
          <div v-if="mode === 'admin' && g.group !== '未分组'" class="filter-row" style="margin: 0; margin-left: auto">
            <input v-model="renameDraft[g.group]" class="input" style="max-width: 90px; padding: 2px 6px" placeholder="新名" @keyup.enter="renameGroup(g.group)" />
            <button class="btn btn-sm btn-outline" type="button" @click="renameGroup(g.group)">重命名</button>
            <button class="btn btn-sm btn-dark" type="button" @click="clearGroup(g.group)">清除</button>
          </div>
        </div>
        <div class="group-card-values">
          <template v-for="v in visibleValues(g.values)" :key="v.value">
            <component
              :is="mode === 'display' && routeKey ? 'RouterLink' : 'span'"
              :to="mode === 'display' && routeKey ? `/tag/${routeKey}/${v.value}` : undefined"
              class="tag-chip mode-fixed"
              :class="{ active: (mode === 'select' && isSelected(v.value)) || (mode === 'display' && v.value === activeValue), 'search-hit': hit(v.value) }"
              :role="mode === 'select' || mode === 'admin' ? 'button' : undefined"
              @click="mode === 'select' ? toggle(v.value) : (mode === 'admin' ? copyValue(v) : undefined)"
            >
              {{ tagLabel(v.value) }}<span class="count">{{ v.demo_count }}</span>
            </component>
          </template>
          <span v-if="!visibleValues(g.values).length" class="muted">空</span>
        </div>

        <div v-if="mode === 'admin' && g.group !== '未分组'" class="group-card-add">
          <input
            v-model="addDraft[g.group]"
            class="input"
            style="max-width: 180px; padding: 2px 6px"
            placeholder="输入值回车归组"
            @keyup.enter="addToGroup(g.group)"
          />
          <button class="btn btn-sm btn-outline" type="button" @click="addToGroup(g.group)">添加</button>
        </div>

        <div v-if="mode === 'admin' && g.group === '未分组'" class="group-card-values" style="margin-top: 6px">
          <template v-for="v in visibleValues(g.values)" :key="v.value">
            <span class="tag-chip mode-fixed" :class="{ 'search-hit': hit(v.value) }">
              {{ tagLabel(v.value) }}<span class="count">{{ v.demo_count }}</span>
              <select class="group-assign" :value="v.group || ''" @change="assignValue(v, ($event.target as HTMLSelectElement).value || null)" @click.stop>
                <option value="">未分组</option>
                <option v-for="gg in (mode === 'admin' ? adminGroups : []).filter((x) => x.group !== '未分组')" :key="gg.group" :value="gg.group">{{ gg.group }}</option>
              </select>
            </span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
