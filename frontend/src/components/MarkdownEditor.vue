<script setup lang="ts">
import { ref, watch } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'

const props = withDefaults(
  defineProps<{ modelValue: string; rows?: number; placeholder?: string }>(),
  { rows: 4, placeholder: '支持 Markdown…' },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const preview = ref(false)
const previewContent = ref(props.modelValue)
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.modelValue,
  (v) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      previewContent.value = v
    }, 300)
  },
  { immediate: true },
)
</script>

<template>
  <div class="md-editor">
    <div class="filter-row" style="margin-bottom: 8px">
      <button class="btn btn-sm btn-outline" type="button" @click="preview = !preview">{{ preview ? '编辑' : '预览' }}</button>
    </div>
    <textarea
      v-if="!preview"
      :value="modelValue"
      class="input textarea"
      :rows="rows"
      :placeholder="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    ></textarea>
    <MarkdownRenderer v-else :content="previewContent" />
  </div>
</template>
