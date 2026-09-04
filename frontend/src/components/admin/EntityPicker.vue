<script setup lang="ts">
// 实体选择器（合并向导 / 别名中心 / 公告关联主题共用）：搜索 + 结果列表，选中回填。
// 不复用公开列表接口：管理端要看 candidate/deprecated 与作品数，才能判断该合谁。
// topics 形态（M0-3）：搜索论坛主题供公告卡「去讨论」互链，meta 显示分类与回复数。
import { computed, ref, watch } from 'vue'
import { api } from '../../api'
import type { ForumTopic, ModelSummary, TaskSummary } from '../../api/types'
import { modelDisplay } from '../../utils/modelDisplay'
import { t } from '../../i18n'

type Row = ModelSummary | TaskSummary | ForumTopic

const props = withDefaults(
  defineProps<{
    kind: 'models' | 'tasks' | 'topics'
    /** 已选中的实体 id（用于高亮 + 排除自身） */
    selectedId?: number | null
    /** 这个 id 不允许被选（防止把 A 合进 A） */
    excludeId?: number | null
    placeholder?: string
  }>(),
  { selectedId: null, excludeId: null, placeholder: '' },
)
const emit = defineEmits<{ pick: [{ id: number; label: string }] }>()

const q = ref('')
const loading = ref(false)
const error = ref('')
const rows = ref<Row[]>([])
const total = ref(0)

function labelOf(x: Row): string {
  if (props.kind === 'topics') return (x as ForumTopic).title
  return 'title' in x ? x.title : modelDisplay(x as ModelSummary)
}
function metaOf(x: Row): string {
  if (props.kind === 'topics') {
    const tp = x as ForumTopic
    return [tp.category, `${tp.reply_count} ${t('entityPicker.replies', '回复')}`].filter(Boolean).join(' · ')
  }
  const e = x as ModelSummary | TaskSummary
  const bits = [`${t('entityPicker.works', '{n} 件', { n: e.demo_count })}`, e.status]
  if ('resolution' in e && e.resolution && e.resolution !== 'exact') bits.push(e.resolution)
  if ('category' in e && e.category) bits.push(e.category as string)
  return bits.join(' · ')
}

async function search() {
  loading.value = true
  error.value = ''
  try {
    if (props.kind === 'models') {
      const r = await api.adminListModels({ q: q.value || undefined, page_size: 30 })
      rows.value = r.items
      total.value = r.total
    } else if (props.kind === 'topics') {
      const r = await api.listForumTopics({ q: q.value || undefined, page_size: 30 })
      rows.value = r.items
      total.value = r.total
    } else {
      const r = await api.adminListEntityTasks({ q: q.value || undefined, page_size: 30 })
      rows.value = r.items
      total.value = r.total
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

const visible = computed(() => rows.value.filter((x) => x.id !== props.excludeId))

watch(() => props.kind, search)
search()
</script>

<template>
  <div class="entity-picker">
    <div class="filter-row" style="margin: 0 0 6px">
      <input
        v-model="q"
        class="input"
        type="search"
        :placeholder="placeholder || t('entityPicker.ph', '搜索名称 / 题面…')"
        @keyup.enter="search"
        @input="search"
      />
      <span class="muted mono">{{ total }}</span>
    </div>
    <div v-if="error" class="notice notice-error" style="margin: 0 0 6px">{{ error }}</div>
    <div v-if="loading && !rows.length" class="muted">{{ t('common.loading', '加载中…') }}</div>
    <ul v-else class="ep-list">
      <li v-for="x in visible" :key="x.id">
        <button
          class="ep-row"
          :class="{ active: selectedId === x.id }"
          type="button"
          @click="emit('pick', { id: x.id, label: labelOf(x) })"
        >
          <span class="ep-label">{{ labelOf(x) }}</span>
          <span class="ep-meta mono">{{ metaOf(x) }}</span>
        </button>
      </li>
      <li v-if="!visible.length" class="muted" style="padding: 6px">{{ t('entityPicker.none', '没有匹配实体') }}</li>
    </ul>
  </div>
</template>
