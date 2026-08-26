<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api'
import { useTagsStore } from '../stores/tags'
import type { TagKeyInfo, TagKeyValue } from '../api/types'

export interface TagPick {
  key: string
  value: string
  description?: string
}

const props = withDefaults(defineProps<{ modelValue: TagPick[]; allowApply?: boolean }>(), { allowApply: true })
const emit = defineEmits<{ 'update:modelValue': [TagPick[]] }>()

const tagsStore = useTagsStore()
const tagKeys = computed(() => tagsStore.keys)
const activeKey = ref('')
const tagSearch = ref('')
const onlySelected = ref(false)
const vendorExpanded = ref<Record<string, boolean>>({})
const suggestExpanded = ref<Record<string, boolean>>({})
const suggestPanelKey = ref('')
const suggest = ref({ value: '', description: '' })
const suggestMsg = ref('')
const suggestError = ref('')

const modeLabel: Record<string, string> = { fixed: '固定值', open: '自定义值', int: '数字值' }
const SUGGEST_SHOW = 8

// 内部 selected：key -> TagPick[]
const selected = ref<Record<string, TagPick[]>>({})

function syncFromModel() {
  const map: Record<string, TagPick[]> = {}
  for (const p of props.modelValue) {
    ;(map[p.key] = map[p.key] || []).push({ key: p.key, value: p.value, description: p.description })
  }
  selected.value = map
}
watch(() => props.modelValue, syncFromModel, { immediate: true })

function emitChange() {
  emit(
    'update:modelValue',
    Object.values(selected.value).flat().map((p) => ({ key: p.key, value: p.value, description: p.description })),
  )
}

function selectedOf(key: string) {
  return selected.value[key] || []
}
function ensureList(key: string): TagPick[] {
  if (!selected.value[key]) selected.value[key] = []
  return selected.value[key]
}
function toggleValue(key: string, value: string, description = '') {
  const list = ensureList(key)
  const i = list.findIndex((x) => x.value === value)
  if (i >= 0) list.splice(i, 1)
  else list.push({ key, value, description })
  emitChange()
}
function addValue(key: string) {
  const k = tagKeys.value.find((x) => x.key === key)
  const raw = String(inputs.value[key]?.value ?? '').trim()
  if (!raw) return
  let final = raw
  if (k?.mode === 'int') {
    if (!/^-?\d+$/.test(raw)) {
      tagErrors.value[key] = '请输入整数'
      return
    }
    final = String(Number(raw))
  }
  if (selectedOf(key).some((x) => x.value === final)) {
    inputs.value[key] = { value: '', description: '' }
    return
  }
  ensureList(key).push({ key, value: final, description: String(inputs.value[key]?.description ?? '').trim() })
  inputs.value[key] = { value: '', description: '' }
  emitChange()
}
function removeValue(key: string, value: string) {
  const list = selected.value[key]
  if (!list) return
  const i = list.findIndex((x) => x.value === value)
  if (i >= 0) list.splice(i, 1)
  emitChange()
}
function clearAll() {
  selected.value = {}
  emitChange()
}

const inputs = ref<Record<string, { value: string; description: string }>>({})
const tagErrors = ref<Record<string, string>>({})

const selectedCount = computed(() => Object.values(selected.value).reduce((n, arr) => n + arr.length, 0))
const selectedList = computed(() =>
  Object.values(selected.value).flat().map((p) => ({ key: p.key, value: p.value, description: p.description })),
)

const searchActive = computed(() => tagSearch.value.trim().length > 0)
const filteredKeys = computed(() => {
  const q = tagSearch.value.trim().toLowerCase()
  if (!q) return tagKeys.value
  return tagKeys.value.filter(
    (k) =>
      k.key.toLowerCase().includes(q) ||
      (k.label || '').toLowerCase().includes(q) ||
      k.values.some((v) => v.value.toLowerCase().includes(q)),
  )
})
const activeTagKey = computed(() => tagKeys.value.find((k) => k.key === activeKey.value) || null)

const VENDOR_PREFIX: [string, string][] = [
  ['dsv', 'DeepSeek'],
  ['deepseek', 'DeepSeek'],
  ['gpt', 'OpenAI'],
  ['o1', 'OpenAI'],
  ['o3', 'OpenAI'],
  ['claude', 'Anthropic'],
  ['gemini', 'Google'],
  ['qwen', '阿里'],
  ['doubao', '字节'],
]
function guessVendor(value: string): string {
  const v = value.toLowerCase()
  for (const [prefix, name] of VENDOR_PREFIX) {
    if (v.startsWith(prefix)) return name
  }
  return '其他'
}
function vendorGroups(k: TagKeyInfo) {
  const map = new Map<string, TagKeyValue[]>()
  for (const v of k.values) {
    const g = v.group || guessVendor(v.value)
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(v)
  }
  return [...map.entries()].map(([group, values]) => ({ group, values }))
}
function isVendorCollapsed(group: string) {
  return vendorExpanded.value[group] === true
}
function toggleVendor(group: string) {
  vendorExpanded.value = { ...vendorExpanded.value, [group]: !isVendorCollapsed(group) }
}
function suggestionValues(k: TagKeyInfo) {
  return suggestExpanded.value[k.key] ? k.values : k.values.slice(0, SUGGEST_SHOW)
}
function toggleSuggest(key: string) {
  suggestExpanded.value = { ...suggestExpanded.value, [key]: !suggestExpanded.value[key] }
}
function toggleSuggestPanel(key: string) {
  if (suggestPanelKey.value === key) {
    suggestPanelKey.value = ''
    return
  }
  suggestPanelKey.value = key
  suggest.value = { value: '', description: '' }
  suggestMsg.value = ''
  suggestError.value = ''
}
async function submitSuggestion() {
  if (!activeTagKey.value) return
  suggestMsg.value = ''
  suggestError.value = ''
  if (!suggest.value.value.trim()) {
    suggestError.value = '请填写新值'
    return
  }
  try {
    await api.suggestTagValue({
      key: activeTagKey.value.key,
      value: suggest.value.value.trim(),
      description: suggest.value.description.trim() || undefined,
    })
    suggestMsg.value = '已提交，等待管理员审核'
    suggest.value = { value: '', description: '' }
  } catch (e) {
    suggestError.value = (e as Error).message
  }
}

onMounted(async () => {
  await tagsStore.load()
  if (!activeKey.value && tagKeys.value.length) activeKey.value = tagKeys.value[0].key
  for (const k of tagKeys.value) {
    if (k.mode !== 'fixed') inputs.value[k.key] = { value: '', description: '' }
  }
})
</script>

<template>
  <div class="tag-picker">
    <div class="tag-summary">
      <span class="filter-label">已选 {{ selectedCount }}</span>
      <button class="tag-chip" :class="{ active: onlySelected }" type="button" @click="onlySelected = !onlySelected">只看已选</button>
      <button v-if="selectedCount" class="btn btn-sm btn-dark" type="button" @click="clearAll">清空</button>
    </div>

    <div v-if="onlySelected" class="tag-pane-selected tag-pane-selected-all">
      <span
        v-for="s in selectedList"
        :key="s.key + ':' + s.value"
        class="tag-chip active"
        role="button"
        :title="s.description || '点击移除'"
        @click="removeValue(s.key, s.value)"
      >{{ s.key }}:{{ s.value }}<span class="chip-x">X</span></span>
      <div v-if="!selectedList.length" class="muted">还没有已选标签</div>
    </div>

    <template v-else>
      <div class="search-box tag-pane-search">
        <input v-model="tagSearch" class="input" type="search" placeholder="搜索标签键 / 值…" />
      </div>

      <div class="tag-pane">
        <div class="tag-pane-keys">
          <template v-for="m in (['fixed', 'open', 'int'] as const)" :key="m">
            <div v-if="filteredKeys.some((k) => k.mode === m)" class="tag-pane-group-label">{{ modeLabel[m] }}</div>
            <button
              v-for="k in filteredKeys.filter((k) => k.mode === m)"
              :key="k.key"
              class="tag-pane-key"
              :class="{ active: activeKey === k.key }"
              type="button"
              @click="activeKey = k.key"
            >
              <span class="tag-pane-key-label">{{ k.label || k.key }} <code>{{ k.key }}</code></span>
              <span class="tag-pane-key-count">{{ selectedOf(k.key).length }}</span>
            </button>
          </template>
          <div v-if="!filteredKeys.length" class="muted" style="padding: 8px">无匹配标签</div>
        </div>

        <div class="tag-pane-values">
          <template v-if="activeTagKey">
            <div class="tag-key-head">
              <b>{{ activeTagKey.label || activeTagKey.key }} <code>{{ activeTagKey.key }}</code></b>
              <span class="mode-badge" :class="'mode-badge-' + activeTagKey.mode">{{ modeLabel[activeTagKey.mode] }}</span>
            </div>

            <template v-if="activeTagKey.mode === 'fixed'">
              <div v-for="g in vendorGroups(activeTagKey)" :key="g.group" class="vendor-group">
                <div class="vendor-group-head" role="button" @click="toggleVendor(g.group)">
                  <span class="vendor-group-name">{{ g.group }}</span>
                  <span v-if="!searchActive" class="vendor-group-toggle">{{ isVendorCollapsed(g.group) ? '展开' : '收起' }}</span>
                </div>
                <div v-if="!isVendorCollapsed(g.group) || searchActive" class="filter-row" style="margin: 0">
                  <button
                    v-for="v in g.values"
                    :key="v.value"
                    class="tag-chip mode-fixed"
                    :class="{ active: selectedOf(activeTagKey.key).some((x) => x.value === v.value) }"
                    type="button"
                    @click="toggleValue(activeTagKey.key, v.value)"
                  >{{ v.value }}<span class="count">{{ v.demo_count }}</span></button>
                </div>
              </div>

              <div v-if="allowApply" class="tag-suggest-new">
                <button v-if="suggestPanelKey !== activeTagKey.key" class="btn btn-sm btn-outline" type="button" @click="toggleSuggestPanel(activeTagKey.key)">+ 申请新值</button>
                <div v-else class="form-stack tag-suggest-new-form">
                  <div class="filter-row" style="margin: 0">
                    <input v-model="suggest.value" class="input" style="max-width: 180px" placeholder="新值" />
                    <input v-model="suggest.description" class="input" style="max-width: 200px" placeholder="介绍（可选）" />
                    <button class="btn btn-sm btn-secondary" type="button" @click="submitSuggestion">申请</button>
                    <button class="btn btn-sm btn-dark" type="button" @click="toggleSuggestPanel(activeTagKey.key)">取消</button>
                  </div>
                  <span v-if="suggestError" class="notice notice-error" style="margin: 4px 0 0; padding: 6px 10px; font-size: 12px">{{ suggestError }}</span>
                  <span v-if="suggestMsg" class="notice notice-success" style="margin: 4px 0 0; padding: 6px 10px; font-size: 12px">{{ suggestMsg }}</span>
                </div>
              </div>
            </template>

            <template v-else-if="activeTagKey.mode === 'open'">
              <div class="form-stack">
                <div class="filter-row" style="margin: 0">
                  <input v-model="inputs[activeTagKey.key].value" class="input" type="text" placeholder="自定义值，如 pvz" style="max-width: 180px" @keyup.enter="addValue(activeTagKey.key)" @input="tagErrors[activeTagKey.key] = ''" />
                  <input v-model="inputs[activeTagKey.key].description" class="input" type="text" placeholder="介绍（可选）" style="max-width: 180px" @keyup.enter="addValue(activeTagKey.key)" />
                  <button class="btn btn-sm btn-secondary" type="button" @click="addValue(activeTagKey.key)">添加</button>
                </div>
                <div v-if="activeTagKey.values.length" class="tag-suggest-block">
                  <button v-if="!suggestExpanded[activeTagKey.key] && !searchActive" class="tag-chip tag-strip-toggle" type="button" @click="toggleSuggest(activeTagKey.key)">已有值 {{ activeTagKey.values.length }} · 展开</button>
                  <template v-else>
                    <div class="filter-row tag-suggest-row">
                      <span class="filter-label tag-suggest-label">已有值</span>
                      <button v-for="v in suggestionValues(activeTagKey)" :key="v.value" class="tag-chip mode-open" :class="{ active: selectedOf(activeTagKey.key).some((x) => x.value === v.value) }" type="button" @click="toggleValue(activeTagKey.key, v.value, v.description || '')">{{ v.value }}<span class="count">{{ v.demo_count }}</span></button>
                    </div>
                  </template>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="form-stack">
                <div class="filter-row" style="margin: 0">
                  <input v-model="inputs[activeTagKey.key].value" class="input" type="number" :placeholder="`整数，如 ${activeTagKey.min ?? 0}~${activeTagKey.max ?? 999}`" style="max-width: 180px" @keyup.enter="addValue(activeTagKey.key)" @input="tagErrors[activeTagKey.key] = ''" />
                  <button class="btn btn-sm btn-secondary" type="button" @click="addValue(activeTagKey.key)">添加</button>
                </div>
                <div v-if="activeTagKey.values.length" class="tag-suggest-block">
                  <button v-if="!suggestExpanded[activeTagKey.key] && !searchActive" class="tag-chip tag-strip-toggle" type="button" @click="toggleSuggest(activeTagKey.key)">已有值 {{ activeTagKey.values.length }} · 展开</button>
                  <template v-else>
                    <div class="filter-row tag-suggest-row">
                      <span class="filter-label tag-suggest-label">已有值</span>
                      <button v-for="v in suggestionValues(activeTagKey)" :key="v.value" class="tag-chip mode-int" :class="{ active: selectedOf(activeTagKey.key).some((x) => x.value === v.value) }" type="button" @click="toggleValue(activeTagKey.key, v.value)">{{ v.value }}<span class="count">{{ v.demo_count }}</span></button>
                    </div>
                  </template>
                </div>
              </div>
            </template>

            <div v-if="selectedOf(activeTagKey.key).length" class="tag-pane-selected">
              <span class="filter-label">已选</span>
              <span
                v-for="v in selectedOf(activeTagKey.key)"
                :key="v.value"
                class="tag-chip active"
                role="button"
                :title="v.description || '点击移除'"
                @click="removeValue(activeTagKey.key, v.value)"
              >{{ v.value }}<span class="chip-x">X</span></span>
            </div>
          </template>
          <div v-else class="muted">请选择左侧标签键</div>
        </div>
      </div>
    </template>
  </div>
</template>
