<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DemoSummary } from '../api/types'
import { tagLabel } from '../utils/funMode'
import { keyLabel } from '../i18n'
import ModelChips from './ModelChips.vue'

const props = defineProps<{ demo: DemoSummary }>()

const cover = computed(() => props.demo.cover_url)
// 封面加载失败（文件缺失/迁移中）时退回色块首字，不留白框 —— 截图里看到过一片空白卡片
const coverBroken = ref(false)
function onCoverError() {
  coverBroken.value = true
}

/** v2：有实体数据时模型走 ModelChips 一等展示，标签行不再重复 model 键 */
const showModelChips = computed(() => !!props.demo.models?.length)

const statLabels: Record<string, string> = {
  model: '模型',
  type: '类型',
  skills: '技能',
  plugin: '插件',
  preset: '预设',
  author: '作者',
}

function label(tag: { key: string; value: string }) {
  // 整活模式：仅显示文案走 tagLabel；:key/路由/复制仍用原始值。键 label 走 i18n（EN → Model/Type…）
  const v = tagLabel(tag.value)
  return `${keyLabel(tag.key, statLabels[tag.key])}:${v}`
}
</script>

<template>
  <RouterLink :to="`/demo/${demo.slug}`" class="card card-hover demo-card animate-in">
    <div class="demo-cover">
      <img v-if="cover && !coverBroken" :src="cover" :alt="demo.title" loading="lazy" decoding="async" @error="onCoverError" />
      <div v-else class="cover-fallback" style="background: #4ecdc4">{{ demo.title[0] }}</div>
    </div>
    <div class="demo-card-body">
      <h3 class="demo-title">{{ demo.title }}</h3>
      <p class="demo-meta">{{ demo.description.slice(0, 60) }}</p>
      <!-- v2：卡片上的模型是"署名"（轻 chip、无印章），层级让位于标题；档案级印章留给详情页/模型页 -->
      <div v-if="showModelChips" class="demo-byline">
        <ModelChips :models="demo.models ?? []" :max="2" size="sm" plain prefix />
      </div>
      <div class="filter-row" style="margin-bottom: 10px">
        <span
          v-for="t in demo.tags.filter((x) => x.key !== 'author' && (x.key !== 'model' || !showModelChips)).slice(0, 3)"
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
