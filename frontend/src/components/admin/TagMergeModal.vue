<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { TagKeyValue, TagMergeResult } from '../../api/types'

const props = defineProps<{ activeKey: string; fromValue: string; values: TagKeyValue[] }>()
const emit = defineEmits<{ close: []; merged: [] }>()

const ui = useUiStore()
const from = ref(props.fromValue)
const to = ref('')
const result = ref<TagMergeResult | null>(null)
const loading = ref(false)
const executing = ref(false)
const error = ref('')

const targetValues = ref<TagKeyValue[]>([])
watch(
  () => props.values,
  (v) => {
    targetValues.value = v.filter((x) => x.value !== from.value)
  },
  { immediate: true },
)
watch(
  () => props.fromValue,
  (v) => {
    from.value = v
    targetValues.value = props.values.filter((x) => x.value !== v)
    result.value = null
    error.value = ''
  },
)

async function preview() {
  if (!from.value.trim() || !to.value) {
    error.value = '请选择目标值'
    return
  }
  loading.value = true
  error.value = ''
  try {
    result.value = await api.mergeTags({
      from_key: props.activeKey,
      from_value: from.value.trim(),
      to_key: props.activeKey,
      to_value: to.value,
      dry_run: true,
    })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function execute() {
  if (!result.value) return
  executing.value = true
  error.value = ''
  try {
    await api.mergeTags({
      from_key: props.activeKey,
      from_value: from.value.trim(),
      to_key: props.activeKey,
      to_value: to.value,
      dry_run: false,
    })
    ui.toast('合并完成', 'success')
    emit('merged')
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    executing.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="tag-merge-modal">
      <div class="tag-merge-mask" @click="emit('close')"></div>
      <div class="tag-merge-panel">
        <div class="tag-merge-head">
          <h2 style="margin: 0">合并标签</h2>
          <button class="btn btn-sm btn-dark" type="button" @click="emit('close')">关闭</button>
        </div>

        <div class="form-stack">
          <label class="field">
            源值
            <input v-model="from" class="input" placeholder="源 value" />
          </label>
          <label class="field">
            目标值
            <select v-model="to" class="input">
              <option value="">选择目标值…</option>
              <option v-for="v in targetValues" :key="v.value" :value="v.value">{{ v.value }}（{{ v.demo_count }}）</option>
            </select>
          </label>

          <div v-if="error" class="notice notice-error">{{ error }}</div>

          <div v-if="result" class="tag-merge-result">
            <div class="filter-row" style="margin: 0">
              <span class="tag-stat"><b>{{ result.merged }}</b> 引用迁移</span>
              <span class="tag-stat"><b>{{ result.removed_dups }}</b> 重复移除</span>
              <span class="tag-stat"><b>{{ result.affected_demos }}</b> 受影响 Demo</span>
              <span class="tag-stat"><b>{{ result.deleted_source ? '是' : '否' }}</b> 源值删除</span>
            </div>
            <p v-if="result.dry_run" class="hint" style="margin: 8px 0 0">以上为预览，确认后才会执行。</p>
          </div>

          <div class="filter-row" style="margin: 0">
            <button class="btn btn-secondary" type="button" :disabled="loading" @click="preview">{{ loading ? '预览中…' : '预览合并' }}</button>
            <button v-if="result" class="btn btn-danger" type="button" :disabled="executing" @click="execute">{{ executing ? '执行中…' : '执行合并' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
