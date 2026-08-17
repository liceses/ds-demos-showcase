<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api'
import type { CommitInfo } from '../api/types'

const props = defineProps<{ slug: string; commits: CommitInfo[] }>()

const expanded = ref<string | null>(null)
const diff = ref('')
const loadingDiff = ref(false)

async function toggle(hash: string) {
  if (expanded.value === hash) {
    expanded.value = null
    return
  }
  expanded.value = hash
  loadingDiff.value = true
  try {
    const detail = await api.getCommitDetail(props.slug, hash)
    diff.value = detail.diff_text
  } catch (e) {
    diff.value = `无法加载 diff：${(e as Error).message}`
  } finally {
    loadingDiff.value = false
  }
}

function diffLines(text: string) {
  return text.split('\n')
}

function lineClass(line: string) {
  if (line.startsWith('diff ') || line.startsWith('@@')) return 'meta'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'ctx'
}
</script>

<template>
  <div>
    <div v-for="c in commits" :key="c.hash_short" class="commit-item">
      <div class="commit-head">
        <span class="commit-hash">{{ c.hash_short }}</span>
        <span class="commit-msg">{{ c.message }}</span>
        <button class="btn btn-sm btn-outline" type="button" @click="toggle(c.hash_short)">
          {{ expanded === c.hash_short ? '收起 diff' : '查看 diff' }}
        </button>
      </div>
      <div class="commit-meta">
        {{ c.author }} · {{ new Date(c.date).toLocaleString('zh-CN') }}
      </div>
      <div v-if="expanded === c.hash_short" class="diff-block">
        <div v-if="loadingDiff" class="loading-row"><span class="spinner"></span> 加载中</div>
        <template v-else>
          <div v-for="(line, i) in diffLines(diff)" :key="i" class="diff-line" :class="lineClass(line)">{{ line }}</div>
        </template>
      </div>
    </div>
  </div>
</template>
