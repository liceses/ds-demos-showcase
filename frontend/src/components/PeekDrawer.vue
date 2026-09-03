<script setup lang="ts">
// 侧滑"瞄一眼"抽屉（Demo 页第 3 期）。
// 存在的理由：详情页的三条图谱边（模型 / 题目 / 其他作品）原本一点就离开本页 ——
// 看一个模型要付"丢失当前作品"的代价，于是没人点，图谱就白建了。
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { api } from '../api'
import type { PeekResult } from '../api/types'
import { modelDisplay, sampleLabel } from '../utils/modelDisplay'
import { t } from '../i18n'

const props = defineProps<{ target: { kind: 'model' | 'task' | 'demo'; slug: string } | null }>()
const emit = defineEmits<{ close: []; navigate: [path: string] }>()

const data = ref<PeekResult | null>(null)
const loading = ref(false)
const error = ref('')
const panelEl = ref<HTMLElement | null>(null)

async function load() {
  if (!props.target) return
  loading.value = true
  error.value = ''
  data.value = null
  try {
    data.value = await api.peek(props.target.kind, props.target.slug)
    await nextTick()
    panelEl.value?.focus()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(() => props.target && `${props.target.kind}:${props.target.slug}`, load)
watch(
  () => !!props.target,
  (open) => {
    if (!open) {
      data.value = null
      error.value = ''
    }
  },
)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.target) {
    e.stopPropagation()
    emit('close')
  }
}
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const KIND_LABEL: Record<string, string> = {
  model: t('peek.kindModel', '模型'),
  task: t('peek.kindTask', '题目'),
  demo: t('peek.kindDemo', '作品'),
}
</script>

<template>
  <Teleport to="body">
    <div v-if="target" class="peek-root">
      <div class="peek-mask" @click="emit('close')"></div>
      <aside ref="panelEl" class="peek-panel card" tabindex="-1" role="dialog" aria-modal="true" :aria-label="KIND_LABEL[target.kind]">
        <header class="peek-head">
          <span class="peek-kind mono">{{ KIND_LABEL[target.kind] }}</span>
          <button class="peek-close" type="button" :aria-label="t('common.close', '关闭')" :title="t('peek.closeTip', '关闭（Esc）')" @click="emit('close')">✕</button>
        </header>

        <div v-if="loading" class="loading-row"><span class="spinner"></span> {{ t('peek.loading', '加载中…') }}</div>
        <div v-else-if="error" class="notice notice-error">{{ error }}</div>

        <template v-else-if="data">
          <h2 class="peek-title">{{ data.kind === 'model' ? modelDisplay(data) : data.name }}</h2>
          <p v-if="data.description" class="peek-brief">{{ data.description }}</p>
          <p v-if="data.is_prompt_excerpt" class="hint">{{ t('peek.fromPrompt', '这段是题目下第一件作品的提示词（作者没写题面说明）') }}</p>

          <div class="peek-stats">
            <span v-if="data.kind === 'model'" class="peek-stat">
              <b>{{ data.score != null ? data.score.toFixed(2) : '—' }}</b>{{ t('peek.score', '社区分') }}
              <i class="mono">{{ (data.votes ?? 0) }}{{ t('peek.votesUnit', '票') }} · {{ sampleLabel(data.sample_level) }}</i>
            </span>
            <span class="peek-stat"><b>{{ data.demo_count ?? 0 }}</b>{{ t('peek.works', '作品') }}</span>
            <span v-if="data.kind === 'task'" class="peek-stat"><b>{{ data.model_count ?? 0 }}</b>{{ t('peek.models', '个模型答过') }}</span>
            <span v-if="data.kind === 'demo' && data.rating_count" class="peek-stat">
              <b>{{ (data.rating_avg ?? 0).toFixed(1) }}</b>{{ t('peek.rating', '评分') }}<i class="mono">({{ data.rating_count }})</i>
            </span>
          </div>

          <div v-if="data.models?.length" class="peek-models">
            <span v-for="m in data.models" :key="m.slug" class="tag-chip mode-fixed">{{ modelDisplay(m) }}</span>
          </div>

          <div v-if="data.demos?.length" class="peek-demos">
            <span class="peek-sub mono">{{ t('peek.topWorks', '代表作') }}</span>
            <RouterLink v-for="d in data.demos" :key="d.slug" class="peek-demo" :to="`/demo/${d.slug}`" @click="emit('close')">
              <span class="peek-demo-title">{{ d.title }}</span>
              <span v-if="d.rating_count" class="peek-demo-rate mono">★{{ d.rating_avg?.toFixed(1) }}({{ d.rating_count }})</span>
            </RouterLink>
          </div>

          <footer class="peek-foot">
            <button class="btn btn-sm btn-secondary" type="button" @click="emit('navigate', data.full_path)">
              {{ t('peek.openHere', '在本页打开') }}
            </button>
            <a class="btn btn-sm btn-outline" :href="data.full_path" target="_blank" rel="noopener">{{ t('peek.openNew', '新标签 ↗') }}</a>
            <span class="hint">{{ t('peek.escHint', 'Esc 关闭') }}</span>
          </footer>
        </template>
      </aside>
    </div>
  </Teleport>
</template>
