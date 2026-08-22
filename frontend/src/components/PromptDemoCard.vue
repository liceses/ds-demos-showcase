<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '../stores/ui'
import type { DemoSummary } from '../api/types'

const props = defineProps<{ demo: DemoSummary }>()
const ui = useUiStore()

const expanded = ref(false)
const prompt = props.demo.prompt?.trim() || ''
const showToggle = prompt.length > 60

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(prompt)
    ui.toast('提示词已复制', 'success')
  } catch {
    ui.toast('复制失败，请手动选择复制', 'error')
  }
}
</script>

<template>
  <div class="card prompt-card">
    <div class="prompt-block" :class="{ expanded }">
      <button
        v-if="prompt"
        class="prompt-copy"
        type="button"
        title="复制提示词"
        @click="copyPrompt"
      >复制</button>
      <p v-if="prompt" class="prompt-text" :class="{ clamp: !expanded }">{{ prompt }}</p>
      <p v-else class="prompt-text prompt-empty">无提示词</p>
      <button
        v-if="prompt && showToggle"
        class="prompt-toggle"
        type="button"
        @click="expanded = !expanded"
      >{{ expanded ? '收起' : '展开' }}</button>
    </div>

    <RouterLink :to="`/demo/${demo.slug}`" class="prompt-body">
      <h3 class="prompt-title">{{ demo.title }}</h3>
      <div class="prompt-cover">
        <img v-if="demo.cover_url" :src="demo.cover_url" :alt="demo.title" loading="lazy" decoding="async" />
        <div v-else class="cover-fallback" style="background: #4ecdc4">{{ demo.title[0] }}</div>
      </div>
    </RouterLink>
  </div>
</template>
