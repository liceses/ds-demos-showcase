<script setup lang="ts">
// 实体检视器 ① 区：概要（RF-4c 从 AdminEntityDetailSection 拆出）。
//
// 这一区最异构，包含三套东西：
//   Model/Task → 自由字段编辑表单（保存即服务端审计；Model 改名会自动把旧名转别名）
//   Tag        → 描述就地编辑（PATCH /admin/entities/tag/{id} 白名单直改）
//                + 分组就地编辑（PUT /tags/admin/values/{tag_id}/group）
//   只读态     → 标识/状态/各实体专属字段 + 明确的"无端点则不给假按钮"标注
//
// API 调用随本组件（与 ②⑤ 同一先例）；宿主通过 @saved（刷新详情+通知更上层）
// 与 @reload（只刷新详情）驱动数据回流。
defineOptions({ name: 'AdminEntitySummarySection' })
import { ref, watch } from 'vue'
import { api } from '../../api'
import type { AdminTaskDetail, ModelDetail } from '../../api/types'
import { useUiStore } from '../../stores/ui'
import EntityStamp from '../EntityStamp.vue'
import { t } from '../../i18n'

const props = defineProps<{
  type: 'model' | 'task' | 'tag'
  id: string
  tagKey?: string
  model: ModelDetail | null
  task: AdminTaskDetail | null
  tagRow: {
    keyLabel: string
    value: { id?: number; value: string; description: string; demo_count: number; group?: string | null; status?: string }
  } | null
  entityName: string
  entityStatus: string | null
  statusZh: Record<string, string>
  demoTotal: number | null
}>()

const emit = defineEmits<{
  /** 写完一处：宿主重拉详情并通知更上层刷新列表 */
  saved: []
  /** 走 tab 深链 */
  goMerge: []
  goAttribution: []
}>()

const ui = useUiStore()
const saving = ref(false)

// ---- Model / Task 自由字段编辑 ----
const editing = ref(false)
const editForm = ref<{ name?: string; vendor?: string; description?: string; title?: string; category?: string }>({})

function startEdit() {
  if (props.type === 'model' && props.model) {
    editForm.value = { name: props.model.name, vendor: props.model.vendor || '', description: props.model.description || '' }
  } else if (props.type === 'task' && props.task) {
    editForm.value = { title: props.task.title, description: props.task.description || '', category: props.task.category || '' }
  }
  editing.value = true
}

async function saveEdit() {
  if (saving.value) return
  saving.value = true
  try {
    if (props.type === 'model' && props.model) {
      await api.updateModel(props.model.slug, {
        name: editForm.value.name?.trim(),
        vendor: editForm.value.vendor || undefined,
        description: editForm.value.description || '',
      })
    } else if (props.type === 'task' && props.task) {
      await api.updateTask(props.task.slug, {
        title: editForm.value.title?.trim(),
        description: editForm.value.description || '',
        category: editForm.value.category || null,
      })
    }
    ui.toast(t('admin.kc.saved', '已保存（服务端已落审计）'), 'success')
    editing.value = false
    emit('saved')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

// ---- Tag 描述就地编辑 ----
const tagDescEditing = ref(false)
const tagDescDraft = ref('')
const tagDescSaving = ref(false)

function startTagDesc() {
  tagDescDraft.value = props.tagRow?.value.description || ''
  tagDescEditing.value = true
}

async function saveTagDesc() {
  const tagId = props.tagRow?.value.id
  if (!tagId || tagDescSaving.value) return
  tagDescSaving.value = true
  try {
    await api.patchEntity('tag', tagId, { description: tagDescDraft.value })
    ui.toast(t('admin.kc.saved', '已保存（服务端已落审计）'), 'success')
    tagDescEditing.value = false
    emit('saved')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    tagDescSaving.value = false
  }
}

// ---- Tag 分组就地编辑（RF-4b：草稿独立，失败可回滚） ----
const groupDraft = ref('')

async function saveGroup() {
  const v = props.tagRow?.value
  if (!v?.id || saving.value) return
  const next = groupDraft.value.trim() || null
  saving.value = true
  try {
    await api.setTagGroup(v.id, next)
    ui.toast(t('admin.kc.saved', '已保存（服务端已落审计）'), 'success')
    emit('saved')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
    groupDraft.value = v.group || '' // 回滚：别让界面停在一个没落库的分组上
  } finally {
    saving.value = false
  }
}

/** 放弃改动：草稿回到服务端真值 */
function resetGroupDraft() {
  groupDraft.value = props.tagRow?.value.group || ''
}

// 详情刷新（emit('saved') 后宿主 load）→ 草稿对齐服务端真值；实体切换也要重置
watch(
  () => [props.tagRow?.value.id, props.tagRow?.value.group, props.id, props.type],
  () => {
    groupDraft.value = props.tagRow?.value.group || ''
    editing.value = false
    tagDescEditing.value = false
  },
  { immediate: true },
)
</script>

<template>
  <section class="kc-zone">
    <div class="kc-zone-head">
      <h3 class="kc-zone-title">{{ t('admin.kc.zSummary', '① 概要') }}</h3>
      <button v-if="type !== 'tag' && !editing" type="button" class="btn btn-sm btn-primary" @click="startEdit">{{ t('admin.kc.edit', '编辑') }}</button>
    </div>
    <div class="kc-summary">
      <EntityStamp :name="entityName" />
      <div class="kc-fields">
        <!-- 编辑态：自由字段（既有端点直改） -->
        <template v-if="editing && type === 'model'">
          <label class="kc-field"><span class="kc-k">{{ t('admin.kc.fName', '名称') }}</span><input v-model="editForm.name" class="input" /></label>
          <label class="kc-field"><span class="kc-k">{{ t('admin.kc.fVendor', '厂商') }}</span><input v-model="editForm.vendor" class="input" :placeholder="t('admin.kc.vendorPh', '可留空')" /></label>
          <label class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.fDesc', '描述') }}</span><textarea v-model="editForm.description" class="input" rows="2" /></label>
          <div class="kc-field kc-wide">
            <button type="button" class="btn btn-sm btn-primary" :disabled="saving" @click="saveEdit">{{ t('admin.kc.save', '保存') }}</button>
            <button type="button" class="btn btn-sm btn-outline" :disabled="saving" @click="editing = false">{{ t('common.cancel', '取消') }}</button>
            <span class="hint">{{ t('admin.kc.saveNote', '保存即服务端审计（before/after/操作者）；改名会自动把旧名转为别名。') }}</span>
          </div>
        </template>
        <template v-else-if="editing && type === 'task'">
          <label class="kc-field"><span class="kc-k">{{ t('admin.kc.fTaskTitle', '题名') }}</span><input v-model="editForm.title" class="input" /></label>
          <label class="kc-field"><span class="kc-k">{{ t('admin.kc.fCat', '分类') }}</span><input v-model="editForm.category" class="input" /></label>
          <label class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.fTaskDesc', '题面描述') }}</span><textarea v-model="editForm.description" class="input" rows="2" /></label>
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
            <span v-if="type === 'tag'" class="kc-pending">{{ t('admin.kc.tagRenamePending', 'value 本体改名=微合并语义（别名+重定向）——端点待后端，不提供假改名。') }}</span>
          </div>
          <div class="kc-field">
            <span class="kc-k">{{ t('admin.kc.fIdent', '标识') }}</span>
            <span class="mono">{{ type === 'tag' ? `${tagKey}:${tagRow?.value.value}` : id }}</span>
            <!-- Model slug=受限：仅合并流程内改（06 A2.2），详情只读+深链 -->
            <button v-if="type === 'model'" type="button" class="btn btn-sm btn-outline" @click="emit('goMerge')">{{ t('admin.kc.slugViaMerge', 'slug 在合并向导内可改 →') }}</button>
          </div>
          <div class="kc-field">
            <span class="kc-k">{{ t('admin.kc.fStatus', '状态') }}</span>
            <span v-if="entityStatus" class="cluster-badge" :class="entityStatus === 'active' ? 'cb-exact' : 'cb-fuzzy'">{{ statusZh[entityStatus] || entityStatus }}</span>
            <span v-else class="kc-pending" :title="t('admin.kc.noStatusTip', 'Tag 现库无状态字段——需后端加字段+端点（协作清单#3）')">{{ t('admin.kc.noStatus', '无状态字段（待后端）') }}</span>
          </div>
          <template v-if="type === 'model'">
            <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fVendor', '厂商') }}</span><span>{{ model?.vendor || '—' }}</span></div>
            <div class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.fDesc', '描述') }}</span><span>{{ model?.description || '—' }}</span></div>
            <div class="kc-field">
              <span class="kc-k">{{ t('admin.kc.fResolution', 'resolution') }}</span>
              <span class="mono">{{ model?.resolution || '—' }}</span>
              <button type="button" class="btn btn-sm btn-outline" @click="emit('goAttribution')">{{ t('admin.kc.resolutionViaAttr', '揭晓走归属工作台 →') }}</button>
            </div>
          </template>
          <template v-else-if="type === 'task'">
            <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fCat', '分类') }}</span><span>{{ task?.category || '—' }}</span></div>
            <div class="kc-field kc-wide"><span class="kc-k">{{ t('admin.kc.fTaskDesc', '题面描述') }}</span><span>{{ task?.description || '—' }}</span></div>
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
                <span class="kc-k">{{ t('admin.kc.fGroupCurrent', '当前分组') }}</span>
                <span>{{ tagRow.value.group || t('admin.kc.noGroup', '（无分组）') }}</span>
              </div>
              <div class="kc-field kc-wide">
                <span class="kc-k">{{ t('admin.kc.fGroupSet', '改分组') }}</span>
                <!-- RF-4b：输入框绑草稿，不再与上方只读的「当前分组」同源 -->
                <input v-model="groupDraft" class="input" style="max-width: 180px" :placeholder="t('admin.kc.groupPh', '输入分组名或留空')" />
                <button type="button" class="btn btn-sm btn-primary" :disabled="saving" @click="saveGroup()">{{ t('admin.kc.save', '保存') }}</button>
                <button v-if="groupDraft !== (tagRow.value.group || '')" type="button" class="btn btn-sm btn-outline" :disabled="saving" @click="resetGroupDraft()">{{ t('common.cancel', '取消') }}</button>
                <span class="hint">{{ t('admin.kc.groupNote', 'PUT /tags/admin/values/{id}/group——既有端点真保存。') }}</span>
              </div>
            </template>
          </template>
          <div class="kc-field"><span class="kc-k">{{ t('admin.kc.fDemos', '关联作品') }}</span><span class="mono">{{ demoTotal ?? '—' }}</span></div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 同 ②③④⑤：宿主的 scoped 样式到不了子组件，所需规则随组件平移 */
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
</style>
