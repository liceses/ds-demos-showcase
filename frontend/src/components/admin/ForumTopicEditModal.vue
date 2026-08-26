<script setup lang="ts">
import { reactive, ref } from 'vue'
import { api } from '../../api'
import { useUiStore } from '../../stores/ui'
import type { ForumTopic } from '../../api/types'

const props = defineProps<{ topic: ForumTopic }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const ui = useUiStore()
const saving = ref(false)
const error = ref('')

const form = reactive({
  title: props.topic.title,
  category: props.topic.category,
  tags: props.topic.tags.join(', '),
  pinned: props.topic.pinned,
  sticky: props.topic.sticky,
  locked: props.topic.locked,
  solved: props.topic.solved,
  status: props.topic.status,
})

async function save() {
  if (!form.title.trim()) {
    error.value = '标题必填'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await api.adminUpdateForumTopic(props.topic.id, {
      title: form.title.trim(),
      category: form.category.trim() || 'general',
      tags: form.tags,
      pinned: form.pinned,
      sticky: form.sticky,
      locked: form.locked,
      solved: form.solved,
      status: form.status,
    })
    ui.toast('主题已更新', 'success')
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="tag-merge-modal">
      <div class="tag-merge-mask" @click="emit('close')"></div>
      <div class="tag-merge-panel">
        <div class="tag-merge-head">
          <h2 style="margin: 0">编辑主题</h2>
          <button class="btn btn-sm btn-dark" type="button" @click="emit('close')">关闭</button>
        </div>

        <div class="form-stack">
          <label class="field">
            标题
            <input v-model="form.title" class="input" />
          </label>
          <label class="field">
            分类
            <input v-model="form.category" class="input" placeholder="general / 交流 / 求助 / 分享…" />
          </label>
          <label class="field">
            标签（逗号分隔）
            <input v-model="form.tags" class="input" placeholder="model:dsv4, type:game" />
          </label>
          <div class="filter-row" style="margin: 0">
            <label style="display: flex; gap: 6px; align-items: center"><input v-model="form.pinned" type="checkbox" /> 置顶</label>
            <label style="display: flex; gap: 6px; align-items: center"><input v-model="form.sticky" type="checkbox" /> 加精</label>
            <label style="display: flex; gap: 6px; align-items: center"><input v-model="form.locked" type="checkbox" /> 锁定</label>
            <label style="display: flex; gap: 6px; align-items: center"><input v-model="form.solved" type="checkbox" /> 已解决</label>
          </div>
          <label class="field">
            状态
            <select v-model="form.status" class="input">
              <option value="normal">正常</option>
              <option value="reviewing">审核中</option>
              <option value="hidden">隐藏</option>
            </select>
          </label>
          <div v-if="error" class="notice notice-error">{{ error }}</div>
          <div class="filter-row" style="margin: 0">
            <button class="btn btn-primary" type="button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
