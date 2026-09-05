<script setup lang="ts">
// M3-3 实体详情（06 §A3.2 统一模板五区，三实体共用）：概要/关系/生命周期/审计时间线/关联作品。
// 【直改权落地口径（用户拍板：所有实体的信息管理都要有直改权）——诚实审计逐端点核过】
//   ✅接真保存（既有端点，服务端落审计）：
//     Model name/vendor/description ← PUT /admin/models/{ident}（改名自动转别名）
//     Model status 跃迁 ← PUT /admin/models/{ident}/status（candidate/active/unverified/deprecated，理由必填）
//     Model 别名增/删 ← POST/DELETE /admin/models/{ident}/aliases
//     Task title/description/category/status ← PUT /admin/tasks/{ident}（update 审计；status 限 candidate/active/merged/hidden）
//     Tag value 分组 ← PUT /tags/admin/values/{tag_id}/group
//   ⏳无端点→输入框置灰+「需后端 PATCH 端点」标注（红线：假动作比没动作更坏，不给假保存）：
//     Tag value description / value 本体改名（=微合并）/ Tag 状态机（现库无状态字段）/ Task canonical prompt / Task 状态理由入参 / Task 状态 deprecated 档
//   🔗非本面板直改→深链：Model slug（仅合并流程内改=06 A2.2 受限）、合并（向导）、resolution（归属工作台）。
// 【后端协作清单】①PATCH /admin/entities/{type}/{id} 字段直改（覆盖 Tag value description/改名、Task canonical prompt）
//                ②Task 状态 pattern 扩 deprecated（06 A3.3 落点）③Tag 状态字段+跃迁端点 ④merge_task 端点（UI 已给禁用态不放假按钮）
defineOptions({ name: 'AdminEntityDetailSection' })
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../api'
import type { AdminTaskDetail, AuditEntry, DemoSummary, ModelDetail, TagKeyInfo, TaskSummary } from '../../api/types'
import { useUiStore } from '../../stores/ui'
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

const ui = useUiStore()
const router = useRouter()

const loading = ref(false)
const error = ref('')
const model = ref<ModelDetail | null>(null)
const task = ref<AdminTaskDetail | null>(null)
const tagRow = ref<{ keyLabel: string; value: { id?: number; value: string; description: string; demo_count: number; group?: string | null } } | null>(null)
const audit = ref<AuditEntry[]>([])
const works = ref<Array<{ slug: string; title: string; rating_avg?: number | null; status?: string; id?: number }>>([])

const editing = ref(false)
const editForm = ref<{ name?: string; vendor?: string; description?: string; title?: string; category?: string }>({})
const saving = ref(false)
const aliasNew = ref('')
const busyAlias = ref(false)
const transOpen = ref(false)
const transStatus = ref('')
const transReason = ref('')
const taskList = ref<(TaskSummary & { merged_into_id?: number | null })[]>([])
// M3-B5 Task 挂摘/合并两步流状态
const attachSlug = ref('')
const attachBusy = ref(false)
const demoOptions = ref<{ slug: string; title: string }[]>([])
const mergeOpen = ref(false)
const mergeTarget = ref('')
const mergeReason = ref('')
const mergePreview = ref<{ source: { id: number; slug: string; title: string }; target: { id: number; slug: string; title: string }; affected_demos: number } | null>(null)
const mergeBusy = ref(false)
// Tag description 直改状态（①tag.description 白名单解锁）
const tagDescEditing = ref(false)
const tagDescDraft = ref('')
const tagDescSaving = ref(false)

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
const demoTotal = computed(() => (props.type === 'task' ? task.value?.demos.length : props.type === 'model' ? model.value?.demo_count : tagRow.value?.value.demo_count) ?? null)
/** Task 状态可选档（后端 TaskUpdateIn pattern 现值；deprecated 缺=协作项） */
const taskStatuses = ['candidate', 'active', 'merged', 'hidden'] as const
/** Model 状态可选档（ModelStatusIn pattern 全量） */
const modelStatuses = ['candidate', 'active', 'unverified', 'deprecated'] as const

function goTab(tab: string) {
  void router.replace({ query: { tab } })
}

async function load() {
  loading.value = true
  error.value = ''
  editing.value = false
  transOpen.value = false
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

// ---- 直改：自由字段编辑（保存即服务端审计） ----
function startEdit() {
  if (props.type === 'model' && model.value) {
    editForm.value = { name: model.value.name, vendor: model.value.vendor || '', description: model.value.description || '' }
  } else if (props.type === 'task' && task.value) {
    editForm.value = { title: task.value.title, description: task.value.description || '', category: task.value.category || '' }
  }
  editing.value = true
}

async function saveEdit() {
  if (saving.value) return
  saving.value = true
  try {
    if (props.type === 'model' && model.value) {
      await api.updateModel(model.value.slug, {
        name: editForm.value.name?.trim(),
        vendor: editForm.value.vendor || undefined,
        description: editForm.value.description || '',
      })
      ui.toast(t('admin.kc.saved', '已保存（服务端已落审计）'), 'success')
    } else if (props.type === 'task' && task.value) {
      await api.updateTask(task.value.slug, {
        title: editForm.value.title?.trim(),
        description: editForm.value.description || '',
        category: editForm.value.category || null,
      })
      ui.toast(t('admin.kc.saved', '已保存（服务端已落审计）'), 'success')
    }
    editing.value = false
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

// ---- 直改：Model 别名增/删（Alias 自由格：别名只是指向，可重建） ----
async function addAlias() {
  const a = aliasNew.value.trim()
  if (!a || !model.value || busyAlias.value) return
  busyAlias.value = true
  try {
    await api.addModelAlias(model.value.slug, a)
    aliasNew.value = ''
    ui.toast(t('admin.kc.aliasAdded', '别名已添加'), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busyAlias.value = false
  }
}

async function removeAlias(alias: string) {
  if (!model.value || busyAlias.value) return
  const ok = await ui.confirm({
    title: t('admin.kc.aliasRemoveTitle', '删除别名？'),
    message: t('admin.kc.aliasRemoveMsg', '「{alias}」将不再指向 {name}。别名只是指向关系，可随时重建。', { alias, name: model.value.name }),
    confirmText: t('admin.kc.aliasRemove', '删除别名'),
  })
  if (!ok) return
  busyAlias.value = true
  try {
    await api.removeModelAlias(model.value.slug, alias)
    ui.toast(t('admin.kc.aliasRemoved', '别名已删除'), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busyAlias.value = false
  }
}

// ---- 直改：状态跃迁（受限格：Model/Task 均理由必填+影响面+二次确认；TaskUpdateIn.reason 已落地=协作项②闭环） ----
function openTransition() {
  transStatus.value = entityStatus.value || ''
  transReason.value = ''
  transOpen.value = !transOpen.value
}

async function doTransition() {
  const target = transStatus.value
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
      await api.setModelStatus(model.value.slug, { status: target, reason: transReason.value.trim() || undefined })
    } else if (props.type === 'task' && task.value) {
      // M3-B5 解锁：TaskUpdateIn.reason 入参已落地（协作项②闭环）——跃迁理由随 update 审计
      await api.updateTask(task.value.slug, { status: target, reason: transReason.value.trim() || undefined })
    }
    ui.toast(t('admin.kc.transDone', '状态已跃迁并落审计'), 'success')
    transOpen.value = false
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

// ---- 直改：Tag 分组（自由格，既有端点） ----
async function saveGroup(group: string | null) {
  const v = tagRow.value?.value
  if (!v?.id || saving.value) return
  saving.value = true
  try {
    await api.setTagGroup(v.id, group)
    ui.toast(t('admin.kc.saved', '已保存（服务端已落审计）'), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

// ---- M3-B5 Task 挂摘（④⑤：by slug；数据源=管理端详情全量） ----
async function loadDemoOptions() {
  if (demoOptions.value.length) return
  try {
    const all = await api.adminDemos()
    demoOptions.value = all.map((d) => ({ slug: d.slug, title: d.title }))
  } catch {
    demoOptions.value = []
  }
}

async function attachDemo() {
  const s = attachSlug.value.trim()
  if (!s || !task.value || attachBusy.value) return
  attachBusy.value = true
  try {
    await api.attachTaskDemoBySlug(task.value.slug, s)
    ui.toast(t('admin.kc.attached', '已挂载（attach 审计）'), 'success')
    attachSlug.value = ''
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    attachBusy.value = false
  }
}

async function detachDemo(slug: string) {
  if (!task.value || attachBusy.value) return
  const ok = await ui.confirm({
    title: t('admin.kc.detachTitle', '摘除作品？'),
    message: t('admin.kc.detachMsg', '《{slug}》将从本题的归属列表移除（detach 审计；可重新挂载）。', { slug }),
    confirmText: t('admin.kc.detach', '摘除'),
  })
  if (!ok) return
  attachBusy.value = true
  try {
    await api.detachTaskDemoBySlug(task.value.slug, slug)
    ui.toast(t('admin.kc.detached', '已摘除（detach 审计）'), 'success')
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    attachBusy.value = false
  }
}

// ---- M3-B5 Task 合并两步流（⑥：显式 dry_run:true 预览 → 确认后显式 false——缺省 false 的坑已规避） ----
async function dryRunMerge() {
  if (!task.value || mergeBusy.value) return
  mergeBusy.value = true
  try {
    const raw = mergeTarget.value.trim()
    // 目标解析：纯数字=id 直用；否则按 slug/题名在管理端任务列表查 id（找不到 422 诚实报错）
    const target = /^\d+$/.test(raw) ? Number(raw) : await resolveTaskTargetId(raw)
    const preview = await api.mergeEntity('tasks', task.value.slug, { target_id: target as number, dry_run: true, reason: mergeReason.value || undefined })
    mergePreview.value = preview as unknown as { source: { id: number; slug: string; title: string }; target: { id: number; slug: string; title: string }; affected_demos: number }
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    mergeBusy.value = false
  }
}

function closeMerge() {
  mergeOpen.value = false
  mergePreview.value = null
}

async function resolveTaskTargetId(raw: string): Promise<number> {
  if (!taskList.value.length) taskList.value = (await api.adminListEntityTasks({ page_size: 200 })).items
  const hit = taskList.value.find((t) => t.slug === raw || t.title === raw || String(t.id) === raw)
  if (!hit) throw new Error(t('admin.kc.mergeTargetNotFound', '目标题目不存在（按 id/slug/题名核对）'))
  return hit.id
}

async function doMerge() {
  if (!task.value || !mergePreview.value || mergeBusy.value) return
  const ok = await ui.confirm({
    title: t('admin.kc.mergeConfirmTitle', '确认合并？'),
    message: t('admin.kc.mergeConfirmMsg', '《{from}》并入《{to}》：{n} 件作品迁移 + 源标 merged（可 unmerge 回溯）。', { from: mergePreview.value.source.title, to: mergePreview.value.target.title, n: mergePreview.value.affected_demos }),
    confirmText: t('admin.kc.mergeDo', '执行合并'),
  })
  if (!ok) return
  mergeBusy.value = true
  try {
    await api.mergeEntity('tasks', task.value.slug, { target_id: mergePreview.value.target.id, dry_run: false, reason: mergeReason.value || undefined })
    ui.toast(t('admin.kc.mergeDone', '已合并并落审计'), 'success')
    mergeOpen.value = false
    mergePreview.value = null
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    mergeBusy.value = false
  }
}

// ---- M3-B5 Tag description 直改（①tag.description 白名单） ----
function startTagDesc() {
  tagDescDraft.value = tagRow.value?.value.description || ''
  tagDescEditing.value = true
}

async function saveTagDesc() {
  const v = tagRow.value?.value
  const tagId = v?.id
  if (!tagId || tagDescSaving.value) return
  tagDescSaving.value = true
  try {
    await api.patchEntity('tag', tagId, { description: tagDescDraft.value })
    ui.toast(t('admin.kc.saved', '已保存（服务端已落审计）'), 'success')
    tagDescEditing.value = false
    await load()
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    tagDescSaving.value = false
  }
}

watch(() => [props.type, props.id, props.tagKey], () => {
  void load()
  if (props.type === 'task') void loadDemoOptions()
})
onMounted(load)
</script>

<template>
  <div>
    <div class="filter-row" style="margin-bottom: 12px">
      <button class="btn btn-sm btn-outline" type="button" @click="emit('back')">← {{ t('admin.kc.backToList', '返回实体总表') }}</button>
      <span class="filter-label">{{ t('admin.kc.detailHint', '实体详情 v0（06 §A3.2 统一模板五区）·直改权诚实落地：有端点即真保存，无端点置灰待后端。') }}</span>
    </div>
    <div v-if="error" class="notice notice-error">{{ error }}</div>
    <LoadingRow v-if="loading" :text="t('admin.kc.loading', '加载实体详情…')" />

    <template v-else>
      <!-- ① 概要（含直改表单） -->
      <section class="kc-zone">
        <div class="kc-zone-head">
          <h3 class="kc-zone-title">{{ t('admin.kc.zSummary', '① 概要') }}</h3>
          <button v-if="props.type !== 'tag' && !editing" type="button" class="btn btn-sm btn-primary" @click="startEdit">{{ t('admin.kc.edit', '编辑') }}</button>
        </div>
        <div class="kc-summary">
          <EntityStamp :name="entityName" />
          <div class="kc-fields">
            <!-- 编辑态：自由字段（既有端点直改） -->
            <template v-if="editing && props.type === 'model'">
              <label class="kc-field"><span class="kc-k">{{ t('admin.kc.fName', '名称') }}</span><input v-model="editForm.name" class="input" /></label>
              <label class="kc-field"><span class="kc-k">{{ t('admin.kc.fVendor', '厂商') }}</span><input v-model="editForm.vendor" class="input" :placeholder="t('admin.kc.vendorPh', '可留空')" /></label>
              <label class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.fDesc', '描述') }}</span><textarea v-model="editForm.description" class="input" rows="2" /></label>
              <div class="kc-field kc-wide">
                <button type="button" class="btn btn-sm btn-primary" :disabled="saving" @click="saveEdit">{{ t('admin.kc.save', '保存') }}</button>
                <button type="button" class="btn btn-sm btn-outline" :disabled="saving" @click="editing = false">{{ t('common.cancel', '取消') }}</button>
                <span class="hint">{{ t('admin.kc.saveNote', '保存即服务端审计（before/after/操作者）；改名会自动把旧名转为别名。') }}</span>
              </div>
            </template>
            <template v-else-if="editing && props.type === 'task'">
              <label class="kc-field"><span class="kc-k">{{ t('admin.kc.fName', '题名') }}</span><input v-model="editForm.title" class="input" /></label>
              <label class="kc-field"><span class="kc-k">{{ t('admin.kc.fCat', '分类') }}</span><input v-model="editForm.category" class="input" /></label>
              <label class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.fDesc', '题面描述') }}</span><textarea v-model="editForm.description" class="input" rows="2" /></label>
              <div class="kc-field kc-wide">
                <button type="button" class="btn btn-sm btn-primary" :disabled="saving" @click="saveEdit">{{ t('admin.kc.save', '保存') }}</button>
                <button type="button" class="btn btn-sm btn-outline" :disabled="saving" @click="editing = false">{{ t('common.cancel', '取消') }}</button>
                <span class="hint">{{ t('admin.kc.saveNoteTask', 'PUT /admin/tasks/{ident}：变更落 update 审计。') }}</span>
              </div>
            </template>
            <!-- 只读态 -->
            <template v-else>
              <div class="kc-field">
                <span class="kc-k">{{ t('admin.kc.fName', '名称') }}</span>
                <b>{{ entityName }}</b>
                <span v-if="props.type === 'tag'" class="kc-pending">{{ t('admin.kc.tagRenamePending', 'value 本体改名=微合并语义（别名+重定向）——端点待后端，不提供假改名。') }}</span>
              </div>
              <div class="kc-field">
                <span class="kc-k">{{ t('admin.kc.fIdent', '标识') }}</span>
                <span class="mono">{{ props.type === 'tag' ? `${props.tagKey}:${tagRow?.value.value}` : props.id }}</span>
                <!-- Model slug=受限：仅合并流程内改（06 A2.2），详情只读+深链 -->
                <button v-if="props.type === 'model'" type="button" class="btn btn-sm btn-outline" @click="goTab('merge')">{{ t('admin.kc.slugViaMerge', 'slug 在合并向导内可改 →') }}</button>
              </div>
              <div class="kc-field">
                <span class="kc-k">{{ t('admin.kc.fStatus', '状态') }}</span>
                <span v-if="entityStatus" class="cluster-badge cb-exact">{{ statusZh[entityStatus] || entityStatus }}</span>
                <span v-else class="kc-pending" :title="t('admin.kc.noStatusTip', 'Tag 现库无状态字段——需后端加字段+端点（协作清单#3）')">{{ t('admin.kc.noStatus', '无状态字段（待后端）') }}</span>
              </div>
              <template v-if="props.type === 'model'">
                <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fVendor', '厂商') }}</span><span>{{ model?.vendor || '—' }}</span></div>
                <div class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.fDesc', '描述') }}</span><span>{{ model?.description || '—' }}</span></div>
                <div class="kc-field">
                  <span class="kc-k">{{ t('admin.kc.fResolution', 'resolution') }}</span>
                  <span class="mono">{{ model?.resolution || '—' }}</span>
                  <button type="button" class="btn btn-sm btn-outline" @click="goTab('attribution')">{{ t('admin.kc.resolutionViaAttr', '揭晓走归属工作台 →') }}</button>
                </div>
              </template>
              <template v-else-if="props.type === 'task'">
                <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fCat', '分类') }}</span><span>{{ task?.category || '—' }}</span></div>
                <div class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.fDesc', '题面描述') }}</span><span>{{ task?.description || '—' }}</span></div>
                <div class="kc-field kc-wide">
                  <span class="kc-k">{{ t('admin.kc.fPrompt', 'canonical prompt') }}</span>
                  <span class="kc-pending">{{ t('admin.kc.pendingPrompt', '不可直改（核对过 PATCH 白名单）：现库无独立题面字段，「题面摘录」派生自首件作品提示词；如需独立题面=加列协作项') }}</span>
                </div>
              </template>
              <template v-else>
                <div class="kc-field">
                  <span class="kc-k">{{ t('admin.kc.fDesc', '描述') }}</span>
                  <template v-if="tagDescEditing">
                    <input v-model="tagDescDraft" class="input" style="max-width: 260px" />
                    <button type="button" class="btn btn-sm btn-primary" :disabled="tagDescSaving" @click="saveTagDesc">{{ t('admin.kc.save', '保存') }}</button>
                    <button type="button" class="btn btn-sm btn-outline" :disabled="tagDescSaving" @click="tagDescEditing = false">{{ t('common.cancel', '取消') }}</button>
                  </template>
                  <template v-else>
                    <span>{{ tagRow?.value.description || '—' }}</span>
                    <button type="button" class="btn btn-sm btn-outline" @click="startTagDesc">{{ t('admin.kc.edit', '编辑') }}</button>
                    <span class="hint">{{ t('admin.kc.tagDescNote', 'PATCH /admin/entities/tag/{id}——白名单直改，落审计。') }}</span>
                  </template>
                </div>
                <template v-if="tagRow">
                  <div class="kc-field">
                    <span class="kc-k">{{ t('admin.kc.fGroup', '当前分组') }}</span>
                    <span>{{ tagRow.value.group || t('admin.kc.noGroup', '（无分组）') }}</span>
                  </div>
                  <div class="kc-field kc-wide">
                    <span class="kc-k">{{ t('admin.kc.fGroupSet', '改分组') }}</span>
                    <input v-model="tagRow.value.group" class="input" style="max-width: 180px" :placeholder="t('admin.kc.groupPh', '输入分组名或留空')" />
                    <button type="button" class="btn btn-sm btn-primary" :disabled="saving" @click="saveGroup(tagRow.value.group || null)">{{ t('admin.kc.save', '保存') }}</button>
                    <span class="hint">{{ t('admin.kc.groupNote', 'PUT /tags/admin/values/{id}/group——既有端点真保存。') }}</span>
                  </div>
                </template>
              </template>
              <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fDemos', '关联作品') }}</span><span class="mono">{{ demoTotal ?? '—' }}</span></div>
            </template>
          </div>
        </div>
      </section>

      <!-- ② 关系（P3 从别名表+合并历史聚合读；P4 换统一 Relation 端点） -->
      <section class="kc-zone">
        <h3 class="kc-zone-title">{{ t('admin.kc.zRelations', '② 关系') }}</h3>
        <template v-if="props.type === 'model'">
          <div class="kc-rel-row">
            <span class="kc-k">{{ t('admin.kc.fAliases', '别名') }}</span>
            <span v-for="a in model?.aliases || []" :key="a" class="tag-chip mode-open">
              {{ a }}
              <button type="button" class="kc-chip-x" :aria-label="t('admin.kc.aliasRemove', '删除别名')" @click="removeAlias(a)">×</button>
            </span>
            <input v-model="aliasNew" class="input" style="max-width: 200px" :placeholder="t('admin.kc.aliasPh', '新增别名…')" @keyup.enter="addAlias" />
            <button type="button" class="btn btn-sm btn-outline" :disabled="busyAlias || !aliasNew.trim()" @click="addAlias">{{ t('admin.kc.aliasAdd', '添加') }}</button>
          </div>
          <div class="kc-rel-row">
            <span class="kc-k">{{ t('admin.kc.fMergedInto', 'merged_into') }}</span>
            <span class="mono">{{ model?.merged_into ?? '—' }}</span>
            <button type="button" class="btn btn-sm btn-primary" @click="goTab('merge')">{{ t('admin.kc.mergeGo', '合并向导 →') }}</button>
          </div>
        </template>
        <template v-else-if="props.type === 'task'">
          <div class="kc-rel-row">
            <span class="kc-k">{{ t('admin.kc.fMergedInto', 'merged_into') }}</span>
            <span class="mono">{{ task?.merged_into_id ?? '—' }}</span>
            <button v-if="!mergeOpen" type="button" class="btn btn-sm btn-primary" @click="mergeOpen = true">{{ t('admin.kc.mergeGo', '合并向导 →') }}</button>
          </div>
          <div v-if="mergeOpen" class="kc-trans">
            <label class="kc-field"><span class="kc-k">{{ t('admin.kc.mergeTarget', '合并到（题目 id/slug）') }}</span><input v-model="mergeTarget" class="input" style="max-width: 220px" :placeholder="t('admin.kc.mergeTargetPh', '如 12 或 task-slug')" /></label>
            <label class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.transReason', '理由（可选）') }}</span><input v-model="mergeReason" class="input" :placeholder="t('admin.kc.transReasonPh', '会进入审计时间线')" /></label>
            <div class="kc-field kc-wide">
              <button type="button" class="btn btn-sm btn-outline" :disabled="mergeBusy || !mergeTarget.trim() || mergePreview != null" @click="dryRunMerge">{{ t('admin.kc.mergePreview', 'dry_run 预览') }}</button>
              <button type="button" class="btn btn-sm btn-primary" :disabled="mergeBusy || mergePreview == null" @click="doMerge">{{ t('admin.kc.mergeConfirm', '确认合并') }}</button>
              <button type="button" class="btn btn-sm btn-outline" :disabled="mergeBusy" @click="closeMerge">{{ t('common.cancel', '取消') }}</button>
            </div>
            <div v-if="mergePreview" class="hint">
              {{ t('admin.kc.mergePreviewMsg', '预览：《{from}》→《{to}》，{n} 件作品将随迁。确认后显式 dry_run=false 执行；合并可 unmerge 回溯。', { from: mergePreview.source.title, to: mergePreview.target.title, n: mergePreview.affected_demos }) }}
            </div>
          </div>
        </template>
        <template v-else>
          <div class="kc-rel-row">
            <span class="kc-k">{{ t('admin.kc.fGroup', '分组') }}</span>
            <span>{{ tagRow?.value.group || '—' }}</span>
          </div>
        </template>
      </section>

      <!-- ③ 生命周期（状态机条+跃迁表单；Tag 无状态字段=待后端） -->
      <section class="kc-zone">
        <h3 class="kc-zone-title">{{ t('admin.kc.zLifecycle', '③ 生命周期') }}</h3>
        <template v-if="props.type === 'model'">
          <div class="kc-states">
            <template v-for="(s, i) in modelStatuses" :key="s">
              <span class="kc-state" :class="{ on: entityStatus === s }">{{ statusZh[s] }}</span>
              <span v-if="i < modelStatuses.length - 1" class="kc-state-line" aria-hidden="true">—</span>
            </template>
          </div>
          <div v-if="!transOpen" class="kc-rel-row">
            <button type="button" class="btn btn-sm btn-primary" @click="openTransition">{{ t('admin.kc.transition', '状态跃迁…') }}</button>
            <span class="hint">{{ t('admin.kc.transitionNote', '受限操作：理由必填+影响面预览+二次确认；跃迁后状态条硬切、审计时间线顶部插入新行。') }}</span>
          </div>
          <div v-else class="kc-trans">
            <label class="kc-field"><span class="kc-k">{{ t('admin.kc.transTo', '跃迁到') }}</span>
              <select v-model="transStatus" class="input" style="max-width: 180px">
                <option v-for="s in modelStatuses" :key="s" :value="s" :disabled="s === entityStatus">{{ statusZh[s] }}{{ s === entityStatus ? '（当前）' : '' }}</option>
              </select>
            </label>
            <label class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.transReason', '理由（必填）') }}</span><textarea v-model="transReason" class="input" rows="2" :placeholder="t('admin.kc.transReasonPh', '为什么跃迁——会进入审计时间线')" /></label>
            <div class="kc-field kc-wide">
              <button type="button" class="btn btn-sm btn-primary" :disabled="saving || !transReason.trim()" @click="doTransition">{{ t('admin.kc.transGo', '执行跃迁') }}</button>
              <button type="button" class="btn btn-sm btn-outline" :disabled="saving" @click="transOpen = false">{{ t('common.cancel', '取消') }}</button>
              <span class="hint">{{ t('admin.kc.transImpact', '影响面：该模型关联作品 {n} 件', { n: demoTotal ?? 0 }) }}</span>
            </div>
          </div>
        </template>
        <template v-else-if="props.type === 'task'">
          <div class="kc-states">
            <template v-for="(s, i) in taskStatuses" :key="s">
              <span class="kc-state" :class="{ on: entityStatus === s }">{{ statusZh[s] }}</span>
              <span v-if="i < taskStatuses.length - 1" class="kc-state-line" aria-hidden="true">—</span>
            </template>
          </div>
          <div v-if="!transOpen" class="kc-rel-row">
            <button type="button" class="btn btn-sm btn-primary" @click="openTransition">{{ t('admin.kc.transition', '状态跃迁…') }}</button>
            <span class="hint">{{ t('admin.kc.transTaskNote', '可选档=candidate/active/merged/hidden（后端 pattern 现值）；deprecated 档待后端扩展（协作清单#2）。') }}</span>
          </div>
          <div v-else class="kc-trans">
            <label class="kc-field"><span class="kc-k">{{ t('admin.kc.transTo', '跃迁到') }}</span>
              <select v-model="transStatus" class="input" style="max-width: 180px">
                <option v-for="s in taskStatuses" :key="s" :value="s" :disabled="s === entityStatus">{{ statusZh[s] }}{{ s === entityStatus ? '（当前）' : '' }}</option>
              </select>
            </label>
            <label class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.transReason', '理由（必填）') }}</span><textarea
              v-model="transReason"
              class="input"
              rows="2"
              style="max-width: 420px"
              :placeholder="t('admin.kc.transReasonPh', '跃迁理由——写入审计时间线')"
            ></textarea></label>
            <div class="kc-field kc-wide">
              <button type="button" class="btn btn-sm btn-primary" :disabled="saving || !transStatus || !transReason.trim()" @click="doTransition">{{ t('admin.kc.transGo', '执行跃迁') }}</button>
              <button type="button" class="btn btn-sm btn-outline" :disabled="saving" @click="transOpen = false">{{ t('common.cancel', '取消') }}</button>
              <span class="hint">{{ t('admin.kc.transTaskImpact', '理由随 update 落审计（TaskUpdateIn.reason）；影响面：该题挂载作品 {n} 件', { n: task?.demos?.length ?? 0 }) }}</span>
            </div>
          </div>
        </template>
        <template v-else>
          <span class="kc-pending">{{ t('admin.kc.tagNoLifecycle', 'Tag 现库无状态字段/跃迁端点——状态机待后端（协作清单#3），不提供假跃迁。') }}</span>
        </template>
      </section>

      <!-- ④ 审计时间线 -->
      <section class="kc-zone">
        <h3 class="kc-zone-title">{{ t('admin.kc.zAudit', '④ 审计时间线') }}</h3>
        <div v-if="!audit.length" class="muted">{{ t('admin.kc.noAudit', '暂无该实体的审计记录') }}</div>
        <ul v-else class="kc-audit">
          <li v-for="a in audit" :key="a.id">
            <span class="mono kc-time">{{ fmtTime(a.created_at) }}</span>
            <span class="mono">{{ a.actor }}</span>
            <span class="kc-act">{{ auditActionLabel(a) }}</span>
            <span class="muted">{{ a.reason || `${a.entity_type}#${a.entity_id}` }}</span>
          </li>
        </ul>
      </section>

      <!-- ⑤ 关联作品（task=管理端全量含 pending/rejected + 挂摘直改；model/tag 只读列表） -->
      <section class="kc-zone">
        <h3 class="kc-zone-title">{{ t('admin.kc.zWorks', '⑤ 关联作品') }}</h3>
        <template v-if="props.type === 'task'">
          <div class="kc-rel-row">
            <input v-model="attachSlug" class="input" style="max-width: 260px" list="kc-demo-slugs" :placeholder="t('admin.kc.attachSlugPh', '输入 demo slug 挂载…')" />
            <datalist id="kc-demo-slugs"><option v-for="o in demoOptions" :key="o.slug" :value="o.slug">{{ o.title }}</option></datalist>
            <button type="button" class="btn btn-sm btn-outline" :disabled="attachBusy || !attachSlug.trim()" @click="attachDemo">{{ t('admin.kc.attachAdd', '挂载') }}</button>
            <span class="hint">{{ t('admin.kc.attachNote', 'POST /admin/tasks/{id}/demos（按 slug，未知整批 404）；挂/摘均落 attach/detach 审计。') }}</span>
          </div>
          <div v-if="!works.length" class="muted">{{ t('admin.kc.noWorks', '没有关联作品') }}</div>
          <ul v-else class="kc-works">
            <li v-for="d in works" :key="d.slug">
              <RouterLink :to="`/demo/${d.slug}`" class="kc-work-link">{{ d.title }}</RouterLink>
              <span class="muted mono">{{ d.slug }}</span>
              <span v-if="d.status && d.status !== 'approved'" class="cluster-badge cb-fuzzy">{{ d.status }}</span>
              <button type="button" class="btn btn-sm btn-outline" :disabled="attachBusy" @click="detachDemo(d.slug)">{{ t('admin.kc.detach', '摘除') }}</button>
            </li>
          </ul>
        </template>
        <template v-else>
          <div v-if="!works.length" class="muted">{{ t('admin.kc.noWorks', '没有关联作品') }}</div>
          <ul v-else class="kc-works">
            <li v-for="d in works" :key="d.slug">
              <RouterLink :to="`/demo/${d.slug}`" class="kc-work-link">{{ d.title }}</RouterLink>
              <span class="muted mono">{{ d.slug }}</span>
              <span v-if="d.rating_avg != null" class="mini-stat"><b>{{ d.rating_avg.toFixed(1) }}</b></span>
            </li>
          </ul>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* ---- M3-3 实体详情五区+直改权（admin scoped 纪律：styles/ 零新增块）---- */
.kc-zone {
  margin-bottom: 22px;
}
.kc-zone-head {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}
.kc-zone-title {
  font-size: 14px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-bottom: var(--border-w, 4px) solid var(--ink, #000);
  padding-bottom: 6px;
  margin-bottom: 12px;
  flex: 1 1 auto;
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
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px 16px;
}
.kc-field {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  flex-wrap: wrap;
}
.kc-wide {
  grid-column: 1 / -1;
}
.kc-k {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft, #555);
}
/* 无端点字段的诚实标注：置灰+虚线下划 */
.kc-pending {
  color: var(--ink-soft, #555);
  font-size: 12px;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.kc-rel-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 6px 0;
}
.kc-chip-x {
  border: none;
  background: none;
  font-weight: 900;
  cursor: pointer;
  padding: 0 0 0 4px;
}
.kc-states {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.kc-state {
  border: 2px solid var(--ink, #000);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 800;
  color: var(--ink-soft, #555);
  background: var(--paper, #fff);
}
.kc-state.on {
  background: var(--ink, #000);
  color: var(--paper, #fff);
}
.kc-state-line {
  color: var(--ink-soft, #555);
}
.kc-trans {
  border: 2px solid var(--ink, #000);
  padding: 12px;
  display: grid;
  gap: 8px;
}
.kc-disabled {
  opacity: 0.55;
  cursor: not-allowed;
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