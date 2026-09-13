<script setup lang="ts">
// 实体检视器 ③ 区：生命周期（RF-4c 从 AdminEntityDetailSection 拆出，三实体状态条+跃迁表单合一）。
//
// 原来 Model / Task / Tag 三套模板逐字重复（只有状态档数组与 hint 文案不同，约 95 行），
// 这里合成一套：档位数组、影响面文案、说明文案由宿主按实体类型传进来；
// 状态条 + 跃迁表单的**本地状态**（是否展开、目标档、理由）归本组件所有；
// 真正的确认与写库仍留在宿主（它持有实体数据与审计语义），通过 emit('transition') 交回。
defineOptions({ name: 'AdminEntityLifecycleSection' })
import { ref, watch } from 'vue'
import { t } from '../../i18n'

const props = defineProps<{
  /** 可选档位（顺序即状态机条的展示顺序） */
  statuses: readonly string[]
  /** 当前状态 */
  status: string | null
  /** 状态码 → 中文（宿主统一维护一份） */
  statusZh: Record<string, string>
  /** 按钮行的提示（各实体口径不同） */
  note: string
  /** 跃迁表单里的影响面提示 */
  impactText: string
  /** 是否要求显式选目标档（Model 默认取当前档，Task/Tag 必须选） */
  requireTarget?: boolean
  /** 零引用实体才显示删除入口（有引用时后端 409，不如不显示） */
  canDelete?: boolean
  deleteLabel?: string
  /** 宿主正在写库（禁用按钮） */
  busy?: boolean
}>()

const emit = defineEmits<{ transition: [{ to: string; reason: string }]; delete: [] }>()

const open = ref(false)
const target = ref('')
const reason = ref('')

function start() {
  target.value = props.status || ''
  reason.value = ''
  open.value = true
}

function close() {
  open.value = false
  reason.value = ''
}

function submit() {
  if (!target.value || !reason.value.trim()) return
  emit('transition', { to: target.value, reason: reason.value.trim() })
}

/** 宿主写库成功后调用，收起表单 */
defineExpose({ close })

// 切换实体时收起（宿主也会用 :key 重挂，这里是双保险）
watch(
  () => [props.status, props.statuses.join(',')],
  () => close(),
)
</script>

<template>
  <section class="kc-zone">
    <h3 class="kc-zone-title">{{ t('admin.kc.zLifecycle', '③ 生命周期') }}</h3>
    <div class="kc-states">
      <template v-for="(s, i) in statuses" :key="s">
        <span class="kc-state" :class="{ on: status === s }">{{ statusZh[s] || s }}</span>
        <span v-if="i < statuses.length - 1" class="kc-state-line" aria-hidden="true">—</span>
      </template>
    </div>

    <div v-if="!open" class="kc-rel-row">
      <button type="button" class="btn btn-sm btn-primary" @click="start">{{ t('admin.kc.transition', '状态跃迁…') }}</button>
      <button v-if="canDelete" type="button" class="btn btn-sm btn-danger" :disabled="busy" @click="emit('delete')">
        {{ deleteLabel }}
      </button>
      <span class="hint">{{ note }}</span>
    </div>

    <div v-else class="kc-trans">
      <label class="kc-field">
        <span class="kc-k">{{ t('admin.kc.transTo', '跃迁到') }}</span>
        <select v-model="target" class="input" style="max-width: 180px">
          <option v-for="s in statuses" :key="s" :value="s" :disabled="s === status">
            {{ statusZh[s] || s }}{{ s === status ? '（当前）' : '' }}
          </option>
        </select>
      </label>
      <label class="kc-field kc-wide">
        <span class="kc-k">{{ t('admin.kc.transReason', '理由（必填）') }}</span>
        <textarea
          v-model="reason"
          class="input"
          rows="2"
          :placeholder="t('admin.kc.transReasonPh', '为什么跃迁——会进入审计时间线')"
        ></textarea>
      </label>
      <div class="kc-field kc-wide">
        <button type="button" class="btn btn-sm btn-primary" :disabled="busy || !target || !reason.trim()" @click="submit">
          {{ t('admin.kc.transGo', '执行跃迁') }}
        </button>
        <button type="button" class="btn btn-sm btn-outline" :disabled="busy" @click="close">{{ t('common.cancel', '取消') }}</button>
        <span class="hint">{{ impactText }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 与 ④⑤ 同理：宿主是 scoped，子组件继承不到它的样式，故平移所需规则 */
.kc-zone {
  margin-bottom: 22px;
}
.kc-zone-title {
  font-size: var(--fs-14);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-bottom: var(--border-w, 4px) solid var(--ink, #000);
  padding-bottom: var(--sp-6);
  margin-bottom: var(--sp-12);
  flex: 1 1 auto;
}
.kc-states {
  display: flex;
  gap: var(--sp-8);
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: var(--sp-10);
}
.kc-state {
  border: 2px solid var(--ink, #000);
  padding: var(--sp-4) var(--sp-10);
  font-size: var(--fs-12);
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
.kc-rel-row {
  display: flex;
  gap: var(--sp-10);
  align-items: center;
  flex-wrap: wrap;
  padding: var(--sp-6) 0;
}
.kc-trans {
  border: 2px solid var(--ink, #000);
  padding: var(--sp-12);
  display: grid;
  gap: var(--sp-8);
}
.kc-field {
  display: flex;
  gap: var(--sp-8);
  align-items: center;
  min-width: 0;
  flex-wrap: wrap;
}
.kc-wide {
  grid-column: 1 / -1;
}
.kc-k {
  flex: 0 0 auto;
  font-size: var(--fs-11);
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ink-soft, #555);
}
</style>
