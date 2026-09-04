<script setup lang="ts">
// M3-2→M3-3 实体详情（06 §A3.2 统一模板，三实体共用）：v0 先立「找得到、看得全」——
// ①概要 ②审计时间线（audit 已有 entity_type+entity_id 服务端过滤）③关联作品；
// M3-3 补全五区（②关系 ③生命周期）并落直改权（诚实口径：既有端点接真保存，
// 无端点字段置灰+「需后端 PATCH 端点」标注——不给假保存，协作清单见文件尾）。
defineOptions({ name: 'AdminEntityDetailSection' })
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../../api'
import type { AuditEntry, DemoSummary, ModelDetail, TagKeyInfo, TaskDetail } from '../../api/types'
import EntityStamp from '../EntityStamp.vue'
import LoadingRow from '../LoadingRow.vue'
import { auditActionLabel, fmtTime } from '../../utils/adminLabels'
import { t } from '../../i18n'

const props = defineProps<{
  type: 'model' | 'task' | 'tag'
  id: string
  /** Tag 值实体所属键（type=tag 时必带） */
  tagKey?: string
}>()
const emit = defineEmits<{ back: [] }>()

const loading = ref(false)
const error = ref('')
const model = ref<ModelDetail | null>(null)
const task = ref<TaskDetail | null>(null)
const tagRow = ref<{ keyLabel: string; value: { id?: number; value: string; description: string; demo_count: number; group?: string | null } } | null>(null)
const audit = ref<AuditEntry[]>([])
const works = ref<DemoSummary[]>([])

const statusZh: Record<string, string> = {
  candidate: '候选',
  active: '在线',
  unverified: '灰测未证实',
  deprecated: '已废弃',
  merged: '已合并',
  hidden: '隐匿',
}

const entityName = computed(() => (props.type === 'model' ? model.value?.name : props.type === 'task' ? task.value?.title : tagRow.value?.value.value) || props.id)
const entityStatus = computed(() => (props.type === 'model' ? model.value?.status : props.type === 'task' ? task.value?.status : null) || null)

async function load() {
  loading.value = true
  error.value = ''
  audit.value = []
  works.value = []
  try {
    if (props.type === 'model') {
      model.value = await api.getModel(props.id)
      const [a, w] = await Promise.all([
        api.getAudit({ entity_type: 'model', entity_id: model.value.id, page_size: 20 }).catch(() => ({ items: [] as AuditEntry[] })),
        api.listDemos({ model: props.id, status: 'approved', page_size: 12 }).catch(() => ({ items: [] as DemoSummary[] })),
      ])
      audit.value = a.items
      works.value = w.items
    } else if (props.type === 'task') {
      task.value = await api.getTask(props.id)
      const [a, w] = await Promise.all([
        api.getAudit({ entity_type: 'task', entity_id: task.value.id, page_size: 20 }).catch(() => ({ items: [] as AuditEntry[] })),
        Promise.resolve({ items: task.value.demos || [] }),
      ])
      audit.value = a.items
      works.value = w.items
    } else {
      const keys = await api.listTagKeys()
      const k = keys.find((x: TagKeyInfo) => x.key === props.tagKey)
      const v = k?.values.find((x) => String(x.id ?? '') === props.id)
      if (!v) throw new Error(t('admin.kc.tagNotFound', '标签值不存在或已被移除'))
      tagRow.value = { keyLabel: k?.label || props.tagKey || '-', value: v }
      const [a, w] = await Promise.all([
        api.getAudit({ entity_type: 'tag', entity_id: v.id ?? 0, page_size: 20 }).catch(() => ({ items: [] as AuditEntry[] })),
        api.listDemos({ tags: [`${props.tagKey}:${v.value}`], status: 'approved', page_size: 12 }).catch(() => ({ items: [] as DemoSummary[] })),
      ])
      audit.value = a.items
      works.value = w.items
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(() => [props.type, props.id, props.tagKey], () => void load())
onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px">
      <button class="btn btn-sm btn-outline" type="button" @click="emit('back')">← {{ t('admin.kc.backToList', '返回实体总表') }}</button>
      <span class="filter-label">{{ t('admin.kc.detailHint', '实体详情 v0（06 §A3.2 统一模板）：先看全，直改权随后端能力逐步接真。') }}</span>
    </div>
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading" :text="t('admin.kc.loading', '加载实体详情…')" />

    <template v-else>
      <!-- ① 概要 -->
      <section class="kc-zone">
        <h3 class="kc-zone-title">{{ t('admin.kc.zSummary', '① 概要') }}</h3>
        <div class="kc-summary">
          <EntityStamp :name="entityName" />
          <div class="kc-fields">
            <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fName', '名称') }}</span><b>{{ entityName }}</b></div>
            <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fIdent', '标识') }}</span><span class="mono">{{ props.type === 'tag' ? `${props.tagKey}:${tagRow?.value.value}` : props.id }}</span></div>
            <div class="kc-field">
              <span class="kc-k">{{ t('admin.kc.fStatus', '状态') }}</span>
              <span v-if="entityStatus" class="cluster-badge cb-exact">{{ statusZh[entityStatus] || entityStatus }}</span>
              <span v-else class="muted">{{ t('admin.kc.noStatus', '无状态字段（待后端）') }}</span>
            </div>
            <template v-if="props.type === 'model'">
              <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fVendor', '厂商') }}</span><span>{{ model?.vendor || '—' }}</span></div>
              <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fDesc', '描述') }}</span><span>{{ model?.description || '—' }}</span></div>
            </template>
            <template v-else-if="props.type === 'task'">
              <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fCat', '分类') }}</span><span>{{ task?.category || '—' }}</span></div>
              <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fDesc', '描述') }}</span><span>{{ task?.description || '—' }}</span></div>
            </template>
            <template v-else>
              <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fDesc', '描述') }}</span><span>{{ tagRow?.value.description || '—' }}</span></div>
              <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fGroup', '分组') }}</span><span>{{ tagRow?.value.group || '—' }}</span></div>
            </template>
            <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fDemos', '关联作品') }}</span><span class="mono">{{ props.type === 'task' ? task?.demos_total : props.type === 'model' ? model?.demo_count : tagRow?.value.demo_count }}</span></div>
          </div>
        </div>
      </section>

      <!-- ② 审计时间线（P3：服务端过滤已有，纯前端装配） -->
      <section class="kc-zone">
        <h3 class="kc-zone-title">{{ t('admin.kc.zAudit', '② 审计时间线') }}</h3>
        <div v-if="!audit.length" class="muted">{{ t('admin.kc.noAudit', '暂无该实体的审计记录（tag 键/值变更未落审计=后端协作项）') }}</div>
        <ul v-else class="kc-audit">
          <li v-for="a in audit" :key="a.id">
            <span class="mono kc-time">{{ fmtTime(a.created_at) }}</span>
            <span class="mono">{{ a.actor }}</span>
            <span class="kc-act">{{ auditActionLabel(a) }}</span>
            <span class="muted">{{ a.reason || `${a.entity_type}#${a.entity_id}` }}</span>
          </li>
        </ul>
      </section>

      <!-- ③ 关联作品（Model/Tag=列表端点过滤；Task=详情自带 demos） -->
      <section class="kc-zone">
        <h3 class="kc-zone-title">{{ t('admin.kc.zWorks', '③ 关联作品') }}</h3>
        <div v-if="!works.length" class="muted">{{ t('admin.kc.noWorks', '没有关联作品') }}</div>
        <ul v-else class="kc-works">
          <li v-for="d in works" :key="d.slug">
            <RouterLink :to="`/demo/${d.slug}`" class="kc-work-link">{{ d.title }}</RouterLink>
            <span class="muted mono">{{ d.slug }}</span>
            <span v-if="d.rating_avg != null" class="mini-stat"><b>{{ d.rating_avg.toFixed(1) }}</b></span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* ---- M3-2 实体详情 v0（admin scoped；M3-3 补 ②关系 ③生命周期两区）---- */
.kc-zone {
  margin-bottom: 22px;
}
.kc-zone-title {
  font-size: 14px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-bottom: var(--border-w, 4px) solid var(--ink, #000);
  padding-bottom: 6px;
  margin-bottom: 12px;
}
.kc-summary {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.kc-fields {
  flex: 1 1 260px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px 16px;
}
.kc-field {
  display: flex;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
}
.kc-k {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft, #555);
}
.kc-audit {
  list-style: none;
  padding: 0;
  margin: 0;
}
.kc-audit li {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 0;
  border-bottom: 2px solid var(--ink, #000);
  font-size: 13px;
  align-items: baseline;
}
.kc-works {
  list-style: none;
  padding: 0;
  margin: 0;
}
.kc-works li {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 6px 0;
  border-bottom: 2px solid var(--ink, #000);
}
.kc-work-link {
  color: var(--ink, #000);
  font-weight: 700;
  text-decoration: none;
}
@media (hover: hover) {
  .kc-work-link:hover {
    text-decoration: underline;
  }
}
</style>