<script setup lang="ts">
// 审计浏览（B4）：谁、什么时候、改了什么、改前改后是什么。
// 动作清单与实体类型都由接口给（前端不硬编码）—— 上一轮 `attribute` 就是因为
// 白名单写死在路由里而筛不出来，这里再写死一次等于把同一个坑复制两份。
defineOptions({ name: 'AdminAuditSection' })
import { computed, onMounted, ref } from 'vue'
import { api } from '../../api'
import type { AuditList } from '../../api/types'
import { fmtTime, auditActionLabel } from '../../utils/adminLabels'
import LoadingRow from '../LoadingRow.vue'
import EmptyBox from '../EmptyBox.vue'
import { t } from '../../i18n'

const data = ref<AuditList | null>(null)
const loading = ref(true)
const error = ref('')
const expanded = ref<Record<number, boolean>>({})

const filters = ref({ action: '', entity_type: '', entity_id: '', q: '' })
const page = ref(1)
const pageSize = 50

const total = computed(() => data.value?.total || 0)
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const ACTION_CLASS: Record<string, string> = {
  create: 'stat-mint',
  attach: 'stat-mint',
  attribute: 'stat-mint',
  update: 'stat-teal',
  status_set: 'stat-teal',
  review: 'stat-teal',
  merge: 'stat-yellow',
  alias_add: 'stat-yellow',
  alias_remove: 'stat-yellow',
  detach: 'stat-yellow',
  delete: 'stat-red',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.getAudit({
      action: filters.value.action || undefined,
      entity_type: filters.value.entity_type || undefined,
      entity_id: filters.value.entity_id ? Number(filters.value.entity_id) : undefined,
      q: filters.value.q || undefined,
      page: page.value,
      page_size: pageSize,
    })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  void load()
}

function go(p: number) {
  page.value = Math.min(Math.max(1, p), pages.value)
  void load()
}

function fmt(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 1)
}

onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px; flex-wrap: wrap">
      <select v-model="filters.action" class="input" style="max-width: 150px" @change="search">
        <option value="">{{ t('admin.audit.allActions', '全部动作') }}</option>
        <option v-for="a in data?.actions || []" :key="a" :value="a">{{ a }}</option>
      </select>
      <select v-model="filters.entity_type" class="input" style="max-width: 140px" @change="search">
        <option value="">{{ t('admin.audit.allEntities', '全部对象') }}</option>
        <option v-for="e in data?.entity_types || []" :key="e" :value="e">{{ e }}</option>
      </select>
      <input v-model="filters.entity_id" class="input" type="number" :placeholder="t('admin.audit.entityIdPh', '对象 ID')" style="max-width: 110px" @keyup.enter="search" />
      <input v-model="filters.q" class="input" :placeholder="t('admin.audit.reasonPh', '按说明搜关键词…')" style="max-width: 220px" @keyup.enter="search" />
      <button class="btn btn-sm btn-primary" type="button" @click="search">{{ t('common.search', '搜索') }}</button>
      <button class="btn btn-sm btn-secondary" type="button" :disabled="loading" @click="load">{{ t('common.refresh', '刷新') }}</button>
      <span class="mini-stat"><b>{{ total }}</b> {{ t('admin.audit.records', '条记录') }}</span>
    </div>

    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading" :text="t('admin.audit.loading', '加载审计…')" />
    <EmptyBox v-else-if="!data?.items.length" :text="t('admin.audit.empty', '没有符合条件的审计记录')" />

    <template v-else>
      <table class="refine-table">
        <thead>
          <tr>
            <th style="width: 128px">{{ t('admin.audit.thTime', '时间') }}</th>
            <th style="width: 96px">{{ t('admin.audit.thWho', '谁') }}</th>
            <th style="width: 104px">{{ t('admin.audit.thAction', '动作') }}</th>
            <th style="width: 120px">{{ t('admin.audit.thTarget', '对象') }}</th>
            <th>{{ t('admin.audit.thReason', '说明') }}</th>
            <th style="width: 60px"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in data.items" :key="r.id">
            <tr>
              <td class="mono muted audit-time">{{ fmtTime(r.created_at) }}</td>
              <td><b>{{ r.actor }}</b><span v-if="r.actor_type !== 'user'" class="muted"> · {{ r.actor_type }}</span></td>
              <td><span class="stat" :class="ACTION_CLASS[r.action] || 'stat-teal'">{{ auditActionLabel(r) }}</span></td>
              <td class="mono">{{ r.entity_type }}#{{ r.entity_id }}</td>
              <td class="audit-reason">{{ r.reason || '—' }}</td>
              <td>
                <button class="btn btn-sm btn-outline" type="button" @click="expanded[r.id] = !expanded[r.id]">
                  {{ expanded[r.id] ? '−' : '+' }}
                </button>
              </td>
            </tr>
            <tr v-if="expanded[r.id]" class="audit-diff-row">
              <td colspan="6">
                <div class="audit-diff">
                  <div>
                    <span class="kpi-label">{{ t('admin.audit.before', '改前') }}</span>
                    <pre class="mono">{{ fmt(r.before) }}</pre>
                  </div>
                  <div>
                    <span class="kpi-label">{{ t('admin.audit.after', '改后') }}</span>
                    <pre class="mono">{{ fmt(r.after) }}</pre>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <div class="filter-row" style="margin-top: 12px">
        <button class="btn btn-sm btn-dark" type="button" :disabled="page <= 1" @click="go(page - 1)">←</button>
        <span class="muted mono">{{ page }} / {{ pages }}</span>
        <button class="btn btn-sm btn-dark" type="button" :disabled="page >= pages" @click="go(page + 1)">→</button>
      </div>
    </template>
  </div>
</template>
