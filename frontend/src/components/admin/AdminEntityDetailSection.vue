<script setup lang="ts">
// M3-3 实体详情（06 §A3.2 统一模板五区，三实体共用）：概要/关系/生命周期/审计时间线/关联作品。
// 【直改权落地口径（用户拍板：所有实体的信息管理都要有直改权）——诚实审计逐端点核过】
//   ✅接真保存（既有端点，服务端落审计）：
//     Model name/vendor/description ← PUT /admin/models/{ident}（改名自动转别名）
//     Model status 跃迁 ← PUT /admin/models/{ident}/status（candidate/active/unverified/deprecated，理由必填）
//     Model 别名增/删 ← POST/DELETE /admin/models/{ident}/aliases
//     Task title/description/category/status ← PUT /admin/tasks/{ident}（update 审计；status 限 candidate/active/merged/hidden）
//     Tag value 分组 ← PUT /tags/admin/values/{tag_id}/group
//     Tag description/group ← PATCH /admin/entities/tag/{id}（M3-B1 白名单直改，落 update 审计）
//     Tag status 跃迁 ← PUT /admin/entities/tag/{id}/status（T3·M5-B2 已落地；candidate/active/deprecated）
//   ⏳无端点→输入框置灰+「需后端 PATCH 端点」标注（红线：假动作比没动作更坏，不给假保存）：
//     Tag value 本体改名（=微合并）/ Task canonical prompt / Task 状态 deprecated 档
//   🔗非本面板直改→深链：Model slug（仅合并流程内改=06 A2.2 受限）、合并（向导）、resolution（归属工作台）。
defineOptions({ name: 'AdminEntityDetailSection' })
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api'
import type { AdminTaskDetail, AuditEntry, DemoSummary, ModelDetail, TagKeyInfo } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import AdminEntityAuditTimeline from './AdminEntityAuditTimeline.vue'
import AdminEntityRelationSection from './AdminEntityRelationSection.vue'
import AdminEntitySummarySection from './AdminEntitySummarySection.vue'
import AdminEntityLifecycleSection from './AdminEntityLifecycleSection.vue'
import AdminEntityWorksSection from './AdminEntityWorksSection.vue'
import LoadingRow from '../LoadingRow.vue'
// T5·M5-F2：DemoPicker 多选挂载（datalist 手输 slug 退役）
import { t } from '../../i18n'

const props = defineProps<{
  type: 'model' | 'task' | 'tag'
  id: string
  /** Tag 值实体所属键（type=tag 时必带） */
  tagKey?: string
  /** 主从工作台嵌入：不显示「返回总表」，名单常驻左侧 */
  embedded?: boolean
}>()
const emit = defineEmits<{ back: []; saved: [] }>()

const ui = useUiStore()
const router = useRouter()

const loading = ref(false)
const error = ref('')
const model = ref<ModelDetail | null>(null)
const task = ref<AdminTaskDetail | null>(null)
const tagRow = ref<{ keyLabel: string; value: { id?: number; value: string; description: string; demo_count: number; group?: string | null; status?: string } } | null>(null)
const audit = ref<AuditEntry[]>([])
const works = ref<Array<{ slug: string; title: string; rating_avg?: number | null; status?: string; id?: number }>>([])

const saving = ref(false)
// Tag description 直改状态（①tag.description 白名单解锁）

const statusZh: Record<string, string> = {
  candidate: '候选',
  active: '在线',
  unverified: '灰测未证实',
  deprecated: '已废弃',
  merged: '已合并',
  hidden: '隐匿',
}

const entityName = computed(() => (props.type === 'model' ? model.value?.name : props.type === 'task' ? task.value?.title : tagRow.value?.value.value) || props.id)
const entityStatus = computed(() => (props.type === 'model' ? model.value?.status : props.type === 'task' ? task.value?.status : (tagRow.value?.value.status || 'active')) || null)
const demoTotal = computed(() => (props.type === 'task' ? task.value?.demos.length : props.type === 'model' ? model.value?.demo_count : tagRow.value?.value.demo_count) ?? null)
/** Task 状态可选档（后端 TaskUpdateIn pattern 现值；deprecated 缺=协作项） */
const taskStatuses = ['candidate', 'active', 'merged', 'hidden'] as const
/** Model 状态可选档（ModelStatusIn pattern 全量） */
const modelStatuses = ['candidate', 'active', 'unverified', 'deprecated'] as const
/** T3·M5-B2 Tag 状态可选档（TagStatusIn pattern；三态 machine=06 §A3.3 落点） */
const tagStatuses = ['candidate', 'active', 'deprecated'] as const

function goTab(tab: string) {
  void router.replace({ query: { tab } })
}

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
      // M3-B5：管理端详情（任何状态含 merged/hidden + 归属作品全量含 pending/rejected）——挂摘 UI 数据源
      task.value = await api.getAdminTaskDetail(props.id)
      const a = await api.getAudit({ entity_type: 'task', entity_id: task.value.id, page_size: 20 }).catch(() => ({ items: [] as AuditEntry[] }))
      audit.value = a.items
      works.value = (task.value.demos || []).map((d) => ({ ...d }))
    } else {
      // T3·M5-B2：管理端全量词表（含 deprecated + status）——公开词表剔 deprecated，
      // 否则详情页打不开已废弃标签、复活操作断链
      const keys = await api.adminListTagKeys()
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

// ---- 直改：状态跃迁（RF-4c：表单态归 AdminEntityLifecycleSection，这里只做确认+写库+刷新） ----
async function doTransition(payload: { to: string; reason: string }) {
  const target = payload.to
  if (!target || target === entityStatus.value) return
  const impact = demoTotal.value ?? 0
  const ok = await ui.confirm({
    title: t('admin.kc.transTitle', '状态跃迁：{from} → {to}', { from: statusZh[entityStatus.value || ''] || entityStatus.value || '—', to: statusZh[target] }),
    message: t('admin.kc.transMsg', '影响面：该实体关联作品 {n} 件，展示侧将随状态标注。操作会落审计（谁/何时/前后值/理由）。', { n: impact }),
    confirmText: t('admin.kc.transDo', '确认跃迁'),
  })
  if (!ok) return
  saving.value = true
  try {
    if (props.type === 'model' && model.value) {
      await api.setModelStatus(model.value.slug, { status: target, reason: payload.reason || undefined })
    } else if (props.type === 'task' && task.value) {
      // M3-B5 解锁：TaskUpdateIn.reason 入参已落地（协作项②闭环）——跃迁理由随 update 审计
      await api.updateTask(task.value.slug, { status: target, reason: payload.reason || undefined })
    } else if (props.type === 'tag' && tagRow.value?.value.id) {
      // T3·M5-B2 解锁：PUT /admin/entities/tag/{id}/status——独立端点+status_set 审计（协作项③闭环）
      await api.setTagStatus(tagRow.value.value.id, { status: target, reason: payload.reason || undefined })
    }
    ui.toast(t('admin.kc.transDone', '状态已跃迁并落审计'), 'success')
    emit('saved') // RF-4b：父级列表的状态列要跟着变
    lifecycleRef.value?.close() // RF-4c：收起子组件的跃迁表单
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

// ---- KB-31：零引用实体删除（后端只为「无引用」放行，有引用返回 409） ----
const canDeleteEntity = computed(
  () => (props.type === 'model' || props.type === 'task') && demoTotal.value === 0 && !!entityStatus.value,
)

async function deleteEntity() {
  if (!canDeleteEntity.value || saving.value) return
  const kind = props.type === 'model' ? t('admin.kc.kindModel', '模型') : t('admin.kc.kindTask', '题目')
  const ok = await ui.confirm({
    title: t('admin.kc.deleteTitle', '删除{kind}「{name}」？', { kind, name: entityName.value || props.id }),
    message: t(
      'admin.kc.deleteMsg',
      '该{kind}当前零引用，可以安全删除；操作不可撤销（会写一条审计）。若日后还想保留名字，请改用「合并」或改状态为已退役。',
      { kind },
    ),
    confirmText: t('admin.kc.deleteDo', '删除'),
    danger: true,
  })
  if (!ok) return
  saving.value = true
  try {
    if (props.type === 'model') {
      await api.adminDeleteModel(props.id)
    } else {
      await api.adminDeleteTask(props.id)
    }
    ui.toast(t('admin.kc.deleteDone', '已删除（零引用实体）'), 'success')
    emit('saved') // RF-4b：实体没了，父级列表必须刷新
    goTab('entities')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

/**
 * 保存分组（RF-4b 修 bug）。
 * 旧实现：输入框与只读的「当前分组」绑的是**同一个对象**（都读 tagRow.value.group），
 * 一边打字「当前分组」就跟着变 —— 读到的是草稿不是真值；保存失败也不回滚，
 * 界面会一直显示一个并未落库的分组。
 * 现在：草稿独立（groupDraft），成功由 load() 拉回服务端真值，失败回滚草稿。
 */
watch(() => [props.type, props.id, props.tagKey], () => {
  void load()
})
/**
 * ⑤ 子组件挂摘所需的标签坐标（从原 currentTagKV 平移过来）：
 * Model 用 model:<name>；Tag 用 <tagKey>:<value>；Task 不走这条（用 attach 端点）。
 */
/** ① 子组件写完自由字段/描述/分组：重拉详情 + 通知更上层刷新列表 */
async function onSummarySaved() {
  emit('saved')
  await load()
}

/** ② 子组件改动了关系（别名/合并）：重拉详情 + 通知更上层刷新列表 */
async function onRelationChanged() {
  emit('saved')
  await load()
}

const lifecycleRef = ref<{ close: () => void } | null>(null)

/** ③ 生命周期：按实体类型算好子组件需要的档位/文案（原来散在三套重复模板里） */
const lifecycleStatuses = computed(() => {
  if (props.type === 'model') return modelStatuses
  if (props.type === 'task') return taskStatuses
  return tagStatuses
})
const lifecycleNote = computed(() => {
  if (props.type === 'model') {
    return t('admin.kc.transitionNote', '受限操作：理由必填+影响面预览+二次确认；跃迁后状态条硬切、审计时间线顶部插入新行。')
  }
  if (props.type === 'task') {
    return t('admin.kc.transTaskNote', '可选档=candidate/active/merged/hidden（后端 pattern 现值）；deprecated 档待后端扩展（协作清单#2）。')
  }
  return t(
    'admin.kc.transTagNote',
    '可选档=candidate/active/deprecated（独立端点 PUT /admin/entities/tag/{id}/status）；理由必填，落 status_set 审计。',
  )
})
const lifecycleImpact = computed(() => {
  if (props.type === 'model') {
    return t('admin.kc.transImpact', '影响面：该模型关联作品 {n} 件', { n: demoTotal.value ?? 0 })
  }
  if (props.type === 'task') {
    return t('admin.kc.transTaskImpact', '理由随 update 落审计（TaskUpdateIn.reason）；影响面：该题挂载作品 {n} 件', {
      n: task.value?.demos?.length ?? 0,
    })
  }
  return t('admin.kc.transTagImpact', '影响面：该标签关联作品 {n} 件；废弃后公开词表/详情/作品卡同步隐去（可复活）。', {
    n: demoTotal.value ?? 0,
  })
})

const worksTagKV = computed(() => {
  if (props.type === 'model' && model.value) return { key: 'model', value: model.value.name }
  if (props.type === 'tag' && props.tagKey && tagRow.value) return { key: props.tagKey, value: tagRow.value.value.value }
  return null
})

/** 子组件挂摘成功：重拉详情 + 通知更上层（原 emit('saved') 语义） */
async function onWorksChanged() {
  emit('saved')
  await load()
}

onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px">
      <button v-if="!embedded" class="btn btn-sm btn-outline" type="button" @click="emit('back')">← {{ t('admin.kc.backToList', '返回实体总表') }}</button>
      <span class="filter-label">{{ t('admin.kc.detailHint', '看→选→改→存：内容字段点保存即审计；合并/slug/状态走身份闸。') }}</span>
    </div>
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading" :text="t('admin.kc.loading', '加载实体详情…')" />

    <template v-else>
      <!-- ① 概要（RF-4c 拆出：编辑表单/标识/状态/Tag 描述与分组就地编辑） -->
      <AdminEntitySummarySection
        :type="props.type"
        :id="props.id"
        :tag-key="props.tagKey"
        :model="model"
        :task="task"
        :tag-row="tagRow"
        :entity-name="entityName"
        :entity-status="entityStatus"
        :status-zh="statusZh"
        :demo-total="demoTotal"
        @saved="onSummarySaved"
        @go-merge="goTab('merge')"
        @go-attribution="goTab('attribution')"
      />

      <!-- ② 关系（RF-4c 拆出：别名/merged_into/合并两步流/分组） -->
      <AdminEntityRelationSection
        :type="props.type"
        :model-slug="model?.slug"
        :aliases="model?.aliases || []"
        :model-merged-into="model?.merged_into ?? null"
        :task-slug="task?.slug"
        :task-id="task?.id ?? null"
        :task-merged-into="task?.merged_into_id ?? null"
        :tag-group="tagRow?.value.group ?? null"
        @changed="onRelationChanged"
        @go-merge="goTab('merge')"
      />

      <!-- ③ 生命周期（RF-4c 拆出：三实体状态条+跃迁表单合一，仅剩一套模板） -->
      <AdminEntityLifecycleSection
        ref="lifecycleRef"
        :statuses="lifecycleStatuses"
        :status="entityStatus"
        :status-zh="statusZh"
        :note="lifecycleNote"
        :impact-text="lifecycleImpact"
        :require-target="props.type !== 'model'"
        :can-delete="canDeleteEntity"
        :delete-label="props.type === 'model' ? t('admin.kc.deleteEntity', '删除该模型') : t('admin.kc.deleteEntityTask', '删除该题目')"
        :busy="saving"
        @transition="doTransition"
        @delete="deleteEntity"
      />

      <!-- ④ 审计时间线（RF-4c 拆出：纯展示，无本地状态） -->
      <AdminEntityAuditTimeline :audit="audit" />

      <!-- ⑤ 关联作品（RF-4c 拆出；:key 让实体切换时重挂，重置挂载选择） -->
      <AdminEntityWorksSection
        :key="`${props.type}:${props.id}`"
        :type="props.type"
        :task-slug="task?.slug"
        :tag-kv="worksTagKV"
        :works="works"
        @changed="onWorksChanged"
      />
    </template>
  </div>
</template>
