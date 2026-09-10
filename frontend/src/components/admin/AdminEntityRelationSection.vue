<script setup lang="ts">
// 实体检视器 ② 区：关系（RF-4c 从 AdminEntityDetailSection 拆出）。
//
// 三实体的"关系"口径各不相同：
//   Model → 别名增删（别名只是指向关系，可随时重建）+ merged_into + 合并向导深链
//   Task  → merged_into + **合并两步流**（显式 dry_run:true 预览 → 确认后显式 dry_run:false）
//   Tag   → 所属分组
//
// API 调用随本组件（与 ⑤ 关联作品同一先例：工作流内聚在这里，宿主只管刷新）：
// 挂摘/别名/合并都属于"这个实体与别的东西的关系"，放一起改动面最小。
//
// ⚠️ dry_run 必须**显式**传参：预览传 true、执行传 false。不要图省事改成缺省值 ——
//    后端缺省是 false，少传一次就等于把预览按钮变成真合并（这是当初踩过的坑）。
defineOptions({ name: 'AdminEntityRelationSection' })
import { ref, watch } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import EntityPicker from '../picker/EntityPicker.vue'
import type { EntityPick } from '../picker/pickerSources'
import { t } from '../../i18n'

const props = defineProps<{
  type: 'model' | 'task' | 'tag'
  /** Model：别名与 merged_into */
  modelSlug?: string | null
  aliases?: string[]
  modelMergedInto?: string | number | null
  /** Task：合并两步流用 */
  taskSlug?: string | null
  taskId?: number | null
  taskMergedInto?: number | null
  /** Tag：所属分组 */
  tagGroup?: string | null
}>()

const emit = defineEmits<{
  /** 关系发生变化：宿主重拉详情并通知更上层刷新列表 */
  changed: []
  /** Model 的「合并向导 →」深链（宿主负责切 tab） */
  goMerge: []
}>()

const ui = useUiStore()

// ---- 别名（Model） ----
const aliasNew = ref('')
const busyAlias = ref(false)

async function addAlias() {
  const a = aliasNew.value.trim()
  if (!a || !props.modelSlug || busyAlias.value) return
  busyAlias.value = true
  try {
    await api.addModelAlias(props.modelSlug, a)
    aliasNew.value = ''
    ui.toast(t('admin.kc.aliasAdded', '别名已添加'), 'success')
    emit('changed')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busyAlias.value = false
  }
}

async function removeAlias(alias: string) {
  if (!props.modelSlug || busyAlias.value) return
  const ok = await ui.confirm({
    title: t('admin.kc.aliasRemoveTitle', '删除别名？'),
    message: t('admin.kc.aliasRemoveMsg', '「{alias}」将不再指向本模型。别名只是指向关系，可随时重建。', { alias }),
    confirmText: t('admin.kc.aliasRemove', '删除别名'),
  })
  if (!ok) return
  busyAlias.value = true
  try {
    await api.removeModelAlias(props.modelSlug, alias)
    ui.toast(t('admin.kc.aliasRemoved', '别名已删除'), 'success')
    emit('changed')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busyAlias.value = false
  }
}

// ---- 合并两步流（Task） ----
const mergeOpen = ref(false)
const mergeTargetPick = ref<EntityPick | null>(null)
const mergeReason = ref('')
const mergePreview = ref<{
  source: { id: number; slug: string; title: string }
  target: { id: number; slug: string; title: string }
  affected_demos: number
} | null>(null)
const mergeBusy = ref(false)

function pickMergeTarget(p: EntityPick) {
  mergeTargetPick.value = p
  mergePreview.value = null // 换目标即作废旧预览：预览必须是当前目标的影响面
}

async function dryRunMerge() {
  if (!props.taskSlug || mergeBusy.value) return
  const rawId = mergeTargetPick.value?.id
  const targetId = typeof rawId === 'number' ? rawId : Number(rawId)
  if (!targetId || Number.isNaN(targetId)) {
    ui.toast(t('admin.kc.mergeNeedTarget', '请选择一个目标题目（需要带 id）'), 'error')
    return
  }
  mergeBusy.value = true
  try {
    // 显式 dry_run: true —— 只预览影响面，不落库
    const preview = await api.mergeEntity('tasks', props.taskSlug, {
      target_id: targetId,
      dry_run: true,
      reason: mergeReason.value.trim() || undefined,
    })
    mergePreview.value = preview as unknown as typeof mergePreview.value
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    mergeBusy.value = false
  }
}

function closeMerge() {
  mergeOpen.value = false
  mergePreview.value = null
  mergeTargetPick.value = null
  mergeReason.value = ''
}

async function doMerge() {
  if (!props.taskSlug || !mergePreview.value || mergeBusy.value) return
  const p = mergePreview.value
  const ok = await ui.confirm({
    title: t('admin.kc.mergeConfirmTitle', '确认合并？'),
    message: t('admin.kc.mergeConfirmMsg', '《{from}》并入《{to}》：{n} 件作品迁移 + 源标 merged（可 unmerge 回溯）。', {
      from: p.source.title,
      to: p.target.title,
      n: p.affected_demos,
    }),
    confirmText: t('admin.kc.mergeDo', '执行合并'),
  })
  if (!ok) return
  mergeBusy.value = true
  try {
    // 显式 dry_run: false —— 这才是真合并（缺省值碰巧也是 false，但这里刻意写明意图）
    await api.mergeEntity('tasks', props.taskSlug, {
      target_id: p.target.id,
      dry_run: false,
      reason: mergeReason.value.trim() || undefined,
    })
    ui.toast(t('admin.kc.mergeDone', '已合并并落审计'), 'success')
    closeMerge()
    emit('changed')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    mergeBusy.value = false
  }
}

// 实体切换（宿主 :key 重挂）之外的兜底：task 变了就收起合并面板
watch(
  () => props.taskSlug,
  () => closeMerge(),
)
</script>

<template>
  <section class="kc-zone">
    <h3 class="kc-zone-title">{{ t('admin.kc.zRelations', '② 关系') }}</h3>

    <template v-if="type === 'model'">
      <div class="kc-rel-row">
        <span class="kc-k">{{ t('admin.kc.fAliases', '别名') }}</span>
        <span v-for="a in aliases || []" :key="a" class="tag-chip mode-open">
          {{ a }}
          <button type="button" class="kc-chip-x" :aria-label="t('admin.kc.aliasRemove', '删除别名')" @click="removeAlias(a)">×</button>
        </span>
        <input v-model="aliasNew" class="input" style="max-width: 200px" :placeholder="t('admin.kc.aliasPh', '新增别名…')" @keyup.enter="addAlias" />
        <button type="button" class="btn btn-sm btn-outline" :disabled="busyAlias || !aliasNew.trim()" @click="addAlias">{{ t('admin.kc.aliasAdd', '添加') }}</button>
      </div>
      <div class="kc-rel-row">
        <span class="kc-k">{{ t('admin.kc.fMergedInto', 'merged_into') }}</span>
        <span class="mono">{{ modelMergedInto ?? '—' }}</span>
        <button type="button" class="btn btn-sm btn-primary" @click="emit('goMerge')">{{ t('admin.kc.mergeGo', '合并向导 →') }}</button>
      </div>
    </template>

    <template v-else-if="type === 'task'">
      <div class="kc-rel-row">
        <span class="kc-k">{{ t('admin.kc.fMergedInto', 'merged_into') }}</span>
        <span class="mono">{{ taskMergedInto ?? '—' }}</span>
        <button v-if="!mergeOpen" type="button" class="btn btn-sm btn-primary" @click="mergeOpen = true">{{ t('admin.kc.mergeGo', '合并向导 →') }}</button>
      </div>
      <div v-if="mergeOpen" class="kc-trans">
        <div class="kc-field kc-wide">
          <span class="kc-k">{{ t('admin.kc.mergeTarget', '合并到') }}</span>
          <EntityPicker
            kind="task"
            mode="dropdown"
            :selected-id="mergeTargetPick?.id"
            :exclude-id="taskId ?? undefined"
            :placeholder="t('admin.kc.mergeTargetPh', '搜题名 / slug 选目标…')"
            @pick="pickMergeTarget"
          />
          <span v-if="mergeTargetPick" class="mono">{{ mergeTargetPick.label }}</span>
        </div>
        <label class="kc-field kc-wide">
          <span class="kc-k">{{ t('admin.kc.mergeReason', '理由（可选）') }}</span>
          <input v-model="mergeReason" class="input" :placeholder="t('admin.kc.transTagReasonPh', '会进入审计时间线')" />
        </label>
        <div class="kc-field kc-wide">
          <button type="button" class="btn btn-sm btn-outline" :disabled="mergeBusy || mergeTargetPick == null || mergePreview != null" @click="dryRunMerge">{{ t('admin.kc.mergePreview', 'dry_run 预览') }}</button>
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
        <span>{{ tagGroup || '—' }}</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* 同 ③④⑤：宿主的 scoped 样式到不了子组件，所需规则随组件平移 */
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
  flex: 1 1 auto;
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
.kc-trans {
  border: 2px solid var(--ink, #000);
  padding: 12px;
  display: grid;
  gap: 8px;
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
</style>
