<script setup lang="ts">
// astra 作品页：大预览 + operator brief（第一轮提示词的橱窗化名）+ 极简落款。
// 无评论/无时间线/无会话日志 Tab——橱窗只呈现结果，过程留在主站。
import { computed, ref, watchEffect } from 'vue'
import { api } from '../api'
import type { DemoDetail } from '../api/types'
import { tagLabel } from '../utils/funMode'
import { fmtDate } from './format'

const props = defineProps<{ slug: string }>()

const demo = ref<DemoDetail | null>(null)
const failed = ref(false)
const loading = ref(true)

api.getDemo(props.slug)
  .then((d) => (demo.value = d))
  .catch(() => (failed.value = true))
  .finally(() => (loading.value = false))

// iframe 沙箱与主站同一套规则：跨源预览才放行 allow-same-origin（localStorage 隔离在预览源）；
// 同源相对路径不放行——demo 无法触碰橱窗页的存储/DOM。
const sandboxAttr = computed(() => {
  const base = 'allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock allow-downloads'
  const src = demo.value?.preview_url
  if (src) {
    try {
      if (new URL(src, location.href).origin !== location.origin) return `${base} allow-same-origin`
    } catch {
      /* 非法 URL 按同源收紧 */
    }
  }
  return base
})

const modelLabel = computed(() => {
  const tags = demo.value?.tags ?? []
  const m = tags.find((t) => t.key === 'model')
  return m ? tagLabel(m.value) : 'astra-canary'
})

const downloadHref = computed(() => `/api/v1/demos/${encodeURIComponent(props.slug)}/download`)

watchEffect(() => {
  if (demo.value) document.title = `${demo.value.title} · astra canary collection`
})
</script>

<template>
  <div v-if="loading" class="ax-loading">loading work…</div>

  <template v-else-if="failed || !demo">
    <RouterLink class="ax-back" to="/">← works</RouterLink>
    <div class="ax-empty">this work is not in the current cohort.</div>
  </template>

  <template v-else>
    <RouterLink class="ax-back" to="/">← works</RouterLink>

    <div class="ax-work-head">
      <h2>{{ demo.title }}</h2>
      <div class="ax-work-meta">
        output · {{ modelLabel }} · {{ fmtDate(demo.created_at) }} · {{ demo.author }}
      </div>
    </div>

    <!-- web：沙箱预览；link：外链跳转；zip：直接给源包 -->
    <iframe
      v-if="demo.demo_type === 'web' && demo.preview_url"
      class="ax-preview-frame"
      :src="demo.preview_url"
      :sandbox="sandboxAttr"
      :title="demo.title"
      allowfullscreen
      allow="fullscreen"
      loading="eager"
    ></iframe>
    <div v-else-if="demo.demo_type === 'link' && demo.external_url" class="ax-brief">
      <div class="ax-brief-label">external artifact</div>
      <p>
        <a :href="demo.external_url" target="_blank" rel="noopener">{{ demo.external_url }}</a>
      </p>
    </div>

    <div class="ax-preview-actions">
      <a v-if="demo.demo_type === 'web' && demo.preview_url" :href="demo.preview_url" target="_blank" rel="noopener">
        open in new tab ↗
      </a>
      <a v-if="demo.demo_type !== 'link'" :href="downloadHref">download source ↓</a>
    </div>

    <div v-if="demo.description" class="ax-brief">
      <div class="ax-brief-label">operator notes</div>
      <p>{{ demo.description }}</p>
    </div>

    <div v-if="demo.prompt" class="ax-brief muted">
      <div class="ax-brief-label">operator brief · first message</div>
      <p>{{ demo.prompt }}</p>
    </div>
  </template>
</template>
