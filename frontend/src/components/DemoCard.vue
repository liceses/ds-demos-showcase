<script setup lang="ts">
import { computed } from 'vue'
import type { DemoSummary } from '../api/types'

const props = defineProps<{ demo: DemoSummary }>()

const cover = computed(() => props.demo.cover_url)

const statLabels: Record<string, string> = {
  model: '模型',
  type: '类型',
  skills: '技能',
  plugin: '插件',
  preset: '预设',
  author: '作者',
}

function label(tag: { key: string; value: string }) {
  return statLabels[tag.key] ? `${statLabels[tag.key]}:${tag.value}` : `${tag.key}:${tag.value}`
}
</script>

<template>
  <RouterLink :to="`/demo/${demo.slug}`" class="card card-hover demo-card animate-in">
    <div class="demo-cover">
      <img v-if="cover" :src="cover" :alt="demo.title" loading="lazy" decoding="async" />
      <div v-else class="cover-fallback" style="background: #4ecdc4">{{ demo.title[0] }}</div>
    </div>
    <div class="demo-card-body">
      <h3 class="demo-title">{{ demo.title }}</h3>
      <p class="demo-meta">{{ demo.description.slice(0, 60) }}</p>
      <div class="filter-row" style="margin-bottom: 10px">
        <span
          v-for="t in demo.tags.filter((x) => x.key !== 'author').slice(0, 3)"
          :key="t.key + ':' + t.value"
          class="tag-chip"
          :class="t.key === 'model' ? 'teal' : t.key === 'type' ? 'red' : ''"
        >
          {{ label(t) }}
        </span>
      </div>
      <div class="demo-stats">
        <span v-if="demo.rating_count" class="stat stat-mint">RATE {{ Number(demo.rating_avg || 0).toFixed(1) }} ({{ demo.rating_count }})</span>
        <span class="stat stat-yellow">VIEW {{ demo.view_count }}</span>
        <span class="stat stat-teal">DL {{ demo.download_count }}</span>
        <span class="stat stat-red">CMT {{ demo.comment_count }}</span>
      </div>
    </div>
  </RouterLink>
</template>
