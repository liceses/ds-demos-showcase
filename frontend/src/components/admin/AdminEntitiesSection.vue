<script setup lang="ts">
// M3-2 实体总表 v1（06 §A3.1 知识中心新面板 / A5 P3 最小集）：Model/Task/Tag 三类实体统一列表——
// 「找得到、看得全」；数据走既有接口（adminListModels / adminListEntityTasks / listTagKeys，零新端点）；
// 行点击→实体详情（?tab=entities&type=<model|task|tag>&id=<ident>[&key=<key>]，详情模板 AdminEntityDetailSection）。
// 搜索：模型/题目走服务端 q（既有参数），标签值客户端过滤；状态筛选取自 status_counts（服务端真值）。
defineOptions({ name: 'AdminEntitiesSection' })
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../api'
import type { ModelSummary, TagKeyInfo, TagKeyValue, TaskSummary } from '../../api/types'
import LoadingRow from '../LoadingRow.vue'
import EmptyBox from '../EmptyBox.vue'
import AdminEntityDetailSection from './AdminEntityDetailSection.vue'
import { t } from '../../i18n'

type Facet = 'model' | 'task' | 'tag'

const route = useRoute()
const router = useRouter()

const facet = ref<Facet>('model')
const q = ref('')
const status = ref('')
const loading = ref(false)
const error = ref('')
const models = ref<ModelSummary[]>([])
const tasks = ref<(TaskSummary & { merged_into_id?: number | null })[]>([])
const tagRows = ref<{ key: string; keyLabel: string; value: TagKeyValue }[]>([])
const statusCounts = ref<Record<string, number>>({})

/** 详情模式：?tab=entities&type=<type>&id=<ident>[&key=<key>]（深链可分享/刷新不丢） */
const detail = computed(() => {
  const type = String(route.query.type || '')
  const id = String(route.query.id || '')
  if ((type === 'model' || type === 'task' || type === 'tag') && id) {
    return { type: type as Facet, id, key: String(route.query.key || '') }
  }
  return null
})


interface Row {
  type: Facet
  ident: string
  /** 详情导航参数：model/task=slug，tag=数值 id */
  idParam: string
  key?: string
  name: string
  sub: string
  status: string | null
  demoCount: number | null
  updatedAt: string | null
}

const STATUS_ZH: Record<string, string> = {
  candidate: '候选',
  active: '在线',
  unverified: '灰测未证实',
  deprecated: '已废弃',
  merged: '已合并',
  hidden: '隐匿',
}

function statusLabel(s: string | null): string {
  if (!s) return '—'
  return t(`admin.entities.status.${s}`, STATUS_ZH[s] || s)
}

const rows = computed<Row[]>(() => {
  const query = q.value.trim().toLowerCase()
  if (facet.value === 'model') {
    return models.value.map((m) => ({
      type: 'model' as const,
      ident: m.slug,
      idParam: m.slug,
      name: m.name,
      sub: m.slug,
      status: m.status,
      demoCount: m.demo_count,
      updatedAt: m.created_at,
    }))
  }
  if (facet.value === 'task') {
    return tasks.value.map((k) => ({
      type: 'task' as const,
      ident: k.slug,
      idParam: k.slug,
      name: k.title,
      sub: k.slug,
      status: k.status,
      demoCount: k.demo_count,
      updatedAt: k.created_at,
    }))
  }
  return tagRows.value
    .filter((r) => !query || r.value.value.toLowerCase().includes(query) || (r.value.description || '').toLowerCase().includes(query))
    .map((r) => ({
      type: 'tag' as const,
      ident: `${r.key}:${r.value.value}`,
      idParam: String(r.value.id ?? ''),
      key: r.key,
      name: r.value.value,
      sub: r.keyLabel,
      status: null, // Tag 无状态字段（06 A3.3 现库实况）——待后端协作项
      demoCount: r.value.demo_count,
      updatedAt: null,
    }))
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (facet.value === 'model') {
      const res = await api.adminListModels({ q: q.value || undefined, status: status.value || undefined, page_size: 200 })
      models.value = res.items
      statusCounts.value = res.status_counts || {}
    } else if (facet.value === 'task') {
      const res = await api.adminListEntityTasks({ q: q.value || undefined, status: status.value || undefined, page_size: 200 })
      tasks.value = res.items
      statusCounts.value = res.status_counts || {}
    } else {
      const keys = await api.listTagKeys()
      tagRows.value = keys.flatMap((k: TagKeyInfo) => k.values.map((v) => ({ key: k.key, keyLabel: k.label || k.key, value: v })))
      statusCounts.value = {}
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function setFacet(f: Facet) {
  facet.value = f
  q.value = ''
  status.value = ''
  void load()
}

function openDetail(row: Row) {
  if (!row.idParam) return
  const query: Record<string, string> = { tab: 'entities', type: row.type, id: row.idParam }
  if (row.key) query.key = row.key
  void router.replace({ query })
}

function backToList() {
  void router.replace({ query: { tab: 'entities' } })
}

onMounted(() => {
  // 带详情深链进入时不必先拉列表（详情自取数）；返回列表时再加载
  if (!detail.value) void load()
})
</script>

<template>
  <div>
    <!-- 详情模式：整体让位给实体详情模板（返回按钮在详情内） -->
    <AdminEntityDetailSection v-if="detail" :type="detail.type" :id="detail.id" :tag-key="detail.key" @back="backToList" />
    <template v-else>
      <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
        <span class="filter-label">{{ t('admin.entities.hint', 'Model / Task / Tag 三类实体的统一入口——先找得到，再谈治理。') }}</span>
        <button
          v-for="f in ([['model', 'admin.entities.facetModel', '模型'], ['task', 'admin.entities.facetTask', '题目'], ['tag', 'admin.entities.facetTag', '标签值']] as const)"
          :key="f[0]"
          type="button"
          class="btn btn-sm"
          :class="facet === f[0] ? 'btn-primary' : 'btn-outline'"
          @click="setFacet(f[0])"
        >
          {{ t(f[1], f[2]) }}
        </button>
        <input v-model="q" class="input" style="max-width: 220px" :placeholder="t('admin.entities.searchPh', '按名称/slug 过滤…')" @keyup.enter="load" />
        <select v-if="facet !== 'tag'" v-model="status" class="input" style="max-width: 140px" @change="load">
          <option value="">{{ t('admin.entities.statusAll', '全部状态') }}</option>
          <option v-for="(n, s) in statusCounts" :key="s" :value="s">{{ statusLabel(String(s)) }} <template v-if="n">({{ n }})</template></option>
        </select>
        <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>
      </div>

      <div v-if="error" class="notice notice-error">{{ error }}</div>
      <LoadingRow v-if="loading && !rows.length" :text="t('admin.entities.loading', '加载实体…')" />
      <EmptyBox v-else-if="!rows.length" :text="t('admin.entities.empty', '没有匹配的实体')" />

      <div v-else class="table-wrap">
        <table class="ent-table">
          <thead>
            <tr>
              <th>{{ t('admin.entities.colEntity', '实体') }}</th>
              <th>{{ t('admin.entities.colName', '名称') }}</th>
              <th>{{ t('admin.entities.colStatus', '状态') }}</th>
              <th>{{ t('admin.entities.colDemos', '关联作品数') }}</th>
              <th>{{ t('admin.entities.colUpdated', '创建时间') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.type + ':' + r.ident" class="ent-row" @click="openDetail(r)">
              <td><span class="cluster-badge cb-exact">{{ t(`admin.entities.facet${r.type[0].toUpperCase() + r.type.slice(1)}`, r.type === 'model' ? '模型' : r.type === 'task' ? '题目' : '标签值') }}</span></td>
              <td>
                <b>{{ r.name }}</b>
                <span class="muted mono ent-sub">{{ r.sub }}</span>
              </td>
              <td>
                <span v-if="r.status" class="cluster-badge" :class="{ 'cb-exact': r.status === 'active', 'cb-fuzzy': r.status === 'deprecated' || r.status === 'merged' || r.status === 'hidden' }">{{ statusLabel(r.status) }}</span>
                <span v-else class="muted" :title="t('admin.entities.noStatusTip', 'Tag 现库无状态字段——状态机待后端（协作项）')">—</span>
              </td>
              <td class="mono">{{ r.demoCount ?? '—' }}</td>
              <td class="mono muted">{{ r.updatedAt ? r.updatedAt.slice(0, 10) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ---- M3-2 实体总表（admin scoped 纪律：styles/ 零新增块）---- */
.ent-table {
  width: 100%;
  border-collapse: collapse;
}
.ent-table th {
  text-align: left;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 8px 10px;
  border-bottom: var(--border-w, 4px) solid var(--ink, #000);
}
.ent-row {
  cursor: pointer;
}
.ent-row td {
  padding: 10px;
  border-bottom: 2px solid var(--ink, #000);
  vertical-align: top;
}
@media (hover: hover) {
  .ent-row:hover {
    background: var(--paper-deep, #f2eee6);
  }
}
.ent-sub {
  display: block;
  font-size: 11px;
}
</style>