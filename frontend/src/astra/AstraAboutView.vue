<script setup lang="ts">
// astra 关于页：一本正经的假 model card（橱窗剧情的核心道具）。
// ⚠️ REQUEST_URL 上线前换成站长真实接收入口（Discord / X / GitHub issue 皆可）。
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { SiteInfo } from '../api/types'

const REQUEST_URL = 'mailto:canary@astrademos.top'

const info = ref<SiteInfo | null>(null)
onMounted(() => {
  api.getSiteInfo().then((d) => (info.value = d)).catch(() => undefined)
})

const specs = computed<Array<[string, string]>>(() => [
  ['status', 'grey test · invite only'],
  ['family', 'astra / canary line'],
  ['capability', 'interactive artifacts — mostly web, sometimes impossible'],
  ['input', 'text · constraints · vibes'],
  ['output', 'self-contained works, shipped live'],
  ['release', `rolling · cohort of ${info.value?.content.demos_total ?? '—'} public outputs`],
])
</script>

<template>
  <section class="ax-doc">
    <h2>model card — astra-canary</h2>

    <div class="ax-kv">
      <div v-for="[k, v] in specs" :key="k">
        <span class="ax-k">{{ k }}</span>
        <span>{{ v }}</span>
      </div>
    </div>

    <p class="ax-note">
      Works in this collection are raw model outputs. Nothing was polished after generation —
      the bugs are part of the record. Collections refresh as the model learns;
      nothing here is final, including this card.
    </p>

    <a class="ax-cta" :href="REQUEST_URL">request access</a>
  </section>
</template>
