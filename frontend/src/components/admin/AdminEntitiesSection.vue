<script setup lang="ts">
// M3-2 实体总表 v1（06 §A3.1 知识中心新面板 / A5 P3 最小集）：Model/Task/Tag 三类实体统一列表——
// 「找得到、看得全」；数据走既有接口（adminListModels / adminListEntityTasks / listTagKeys，零新端点）；
// 行点击→实体详情（?tab=entities&type=<model|task|tag>&id=<ident>[&key=<key>]，详情模板 AdminEntityDetailSection）。
// 搜索：模型/题目走服务端 q（既有参数），标签值客户端过滤；状态筛选取自 status_counts（服务端真值）。
defineOptions({ name: 'AdminEntitiesSection' })
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { ModelSummary, TagKeyInfo, TagKeyValue, TaskSummary } from '../../api/types'
import LoadingRow from '../LoadingRow.vue'
import EmptyBox from '../EmptyBox.vue'
import AdminEntityDetailSection from './AdminEntityDetailSection.vue'
import { t } from '../../i18n'

type Facet = 'model' | 'task' | 'tag'

const ui = useUiStore()
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

// M3-B2 管理员直建题目（02 P1 管理员侧解法）：POST /admin/tasks 即时生效不经候选
// （管理员=治理边界，直建合法对照 v2 §7.12「管理员判断」）；初始挂载=demo_slugs 已落地（t11/M3-B5），未知 slug fail-fast 不留空题
const taskFormOpen = ref(false)
const taskForm = ref({ title: '', category: '', description: '' })
const savingTask = ref(false)
// M3-B5 初始挂载解锁（②demo_slugs）：adminDemos 搜索+chips，建题即挂（slug 先解析后建题 fail-fast）
const attachSlugs = ref<string[]>([])
const attachDraft = ref('')
const demoOpts = ref<{ slug: string; title: string }[]>([])
function addAttach() {
  const s = attachDraft.value.trim()
  if (!s || attachSlugs.value.includes(s)) return
  attachSlugs.value = [...attachSlugs.value, s]
  attachDraft.value = ''
}
function removeAttach(s: string) {
  attachSlugs.value = attachSlugs.value.filter((x) => x !== s)
}
async function loadDemoOpts() {
  if (demoOpts.value.length) return
  try {
    demoOpts.value = (await api.adminDemos()).map((d) => ({ slug: d.slug, title: d.title }))
  } catch {
    demoOpts.value = []
  }
}
const taskErr = ref('')

async function createTask() {
  const title = taskForm.value.title.trim()
  if (!title || savingTask.value) return
  savingTask.value = true
  taskErr.value = ''
  try {
    const created = await api.adminCreateTask({ title, description: taskForm.value.description || undefined, category: taskForm.value.category || undefined, demo_slugs: attachSlugs.value.length ? attachSlugs.value : undefined })
    ui.toast(t('admin.kc.taskCreated', '题目已创建：{slug}', { slug: created.slug }), 'success')
    taskForm.value = { title: '', category: '', description: '' }
    attachSlugs.value = []
    attachDraft.value = ''
    taskFormOpen.value = false
    if (facet.value !== 'task') setFacet('task')
    else void load()
  } catch (e) {
    taskErr.value = (e as Error).message
  } finally {
    savingTask.value = false
  }
}

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
      status: r.value.status || 'active', // T3·M5-B2：状态机字段已落地（徽章展示）
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
      // T3·M5-B2：Tag 词表读口拆分——管理端用全量词表（含 deprecated + status），
      // 否则置废弃后从总表消失、复活入口断链；公开词表(listTagKeys)仍剔 deprecated
      const keys = await api.adminListTagKeys()
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
        <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>        <!-- M3-B2 管理员直建题目入口（02 P1 管理员侧解法）：与 task_proposal 候选制并存——直建=即时生效，用户提议=候选审批 -->        <button class="btn btn-sm btn-primary" type="button" @click="taskFormOpen = !taskFormOpen; if (taskFormOpen) void loadDemoOpts()">+ {{ t('admin.kc.newTask', '新建题目') }}</button>      </div>      <!-- 建题表单：初始挂载=demo_slugs 搜索+chips（t11 端点落地，M3-B5 解锁；未知 slug fail-fast 整批 404 不留空题） -->      <div v-if="taskFormOpen" class="kc-task-form card card-default" style="margin-bottom: 14px">        <div class="filter-row" style="margin: 0 0 10px; flex-wrap: wrap">          <label class="kc-inline"><span class="kc-k">{{ t('admin.kc.fName', '名称') }}</span><input v-model="taskForm.title" class="input" style="max-width: 260px" :placeholder="t('admin.kc.taskTitlePh', '题目名称（必填）')" /></label>          <label class="kc-inline"><span class="kc-k">{{ t('admin.kc.fCat', '分类') }}</span><input v-model="taskForm.category" class="input" style="max-width: 160px" :placeholder="t('admin.kc.taskCatPh', '可选，对齐 category 标签值')" /></label>        </div>        <label class="kc-block"><span class="kc-k">{{ t('admin.kc.fDesc', '题面描述') }}</span><textarea v-model="taskForm.description" class="input" rows="2" :placeholder="t('admin.kc.taskDescPh', '题面口径/评测说明（可选）')" /></label>        <div class="kc-field kc-wide" style="margin: 8px 0">
          <span class="kc-k">{{ t('admin.kc.attachInit', '初始挂载') }}</span>
          <input v-model="attachDraft" class="input" style="max-width: 240px" list="t7-demo-slugs" :placeholder="t('admin.kc.attachSlugPh', '输入 demo slug…')" @keyup.enter="addAttach" />
          <datalist id="t7-demo-slugs"><option v-for="o in demoOpts" :key="o.slug" :value="o.slug">{{ o.title }}</option></datalist>
          <button type="button" class="btn btn-sm btn-outline" @click="addAttach">{{ t('admin.kc.attachAdd', '添加') }}</button>
          <span v-for="s in attachSlugs" :key="s" class="tag-chip mode-open">
            {{ s }}
            <button type="button" class="kc-chip-x" :aria-label="t('common.cancel', '取消')" @click="removeAttach(s)">×</button>
          </span>
          <span class="hint">{{ t('admin.kc.attachNote2', 'demo_slugs 建题即挂（slug 先解析后建题，未知整批 404 不留空题）。') }}</span>
        </div>        <div v-if="taskErr" class="notice notice-error">{{ taskErr }}</div>        <div class="filter-row" style="margin: 0; flex-wrap: wrap">          <button type="button" class="btn btn-sm btn-primary" :disabled="savingTask || !taskForm.title.trim()" @click="createTask">{{ savingTask ? t('admin.kc.saving', '创建中…') : t('admin.kc.taskCreate', '创建题目') }}</button>          <button type="button" class="btn btn-sm btn-outline" :disabled="savingTask" @click="taskFormOpen = false">{{ t('common.cancel', '取消') }}</button>          <span class="hint">{{ t('admin.kc.taskCreateNote', '管理员直建=即时生效（落审计），不经候选队列；用户出题仍走题目候选审批。') }}</span>        </div>      </div>

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
.kc-task-form {  padding: 14px;}.kc-inline,.kc-block {  display: flex;  gap: 8px;  align-items: center;  min-width: 0;  flex-wrap: wrap;}.kc-block {  margin: 8px 0;}</style>