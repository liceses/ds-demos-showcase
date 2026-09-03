<script setup lang="ts">
// ModelChips（v2）：模型实体的全站统一展示原语。
// 两种重量：档案级（默认，带印章，详情页/模型页用）与署名级（plain，卡片行内用）。
// 卡片上模型是"署名"不是"档案" —— 标题才是卡片的最高对比元素（设计依据：优化设计 §2）。
import type { ModelBrief } from '../api/types'
import { modelDisplay } from '../utils/modelDisplay'
import { t } from '../i18n'
import EntityStamp from './EntityStamp.vue'

const props = withDefaults(
  defineProps<{
    models: ModelBrief[]
    /** 最多展示几个，超出收进 +N（卡片用 2，详情页用 6） */
    max?: number
    size?: 'sm' | 'md' | 'lg'
    /** 轻署名：无印章、弱描边；兜底位不给链接（不制造"点进去看空概念"的死路） */
    plain?: boolean
    /** plain 模式下加「由 …」前缀，把"这是署名"讲明白（provenance 明示） */
    prefix?: boolean
    /** peek：点击不跳转，而是抛给父级开侧滑预览（详情页用它保住当前作品） */
    peek?: boolean
  }>(),
  { max: 2, size: 'sm', plain: false, prefix: false, peek: false },
)

const emit = defineEmits<{ peek: [slug: string] }>()

const FALLBACK = new Set(['unknown', 'family'])

function shownName(m: ModelBrief): string {
  return modelDisplay(m)
}
/** 兜底位在轻署名模式下不可点：未标注/未定型号没有可浏览的实体内容 */
function linkable(m: ModelBrief): boolean {
  return !props.plain || !FALLBACK.has(m.resolution || 'exact')
}
</script>

<template>
  <span v-if="models.length" class="model-chips" :class="[plain ? 'chips-plain' : '', 'chips-' + size]">
    <span v-if="prefix" class="model-by">{{ t('models.by', '由') }}</span>
    <component
      :is="peek ? 'button' : linkable(m) ? 'RouterLink' : 'span'"
      v-for="m in models.slice(0, max)"
      :key="m.slug"
      class="model-chip"
      :class="{ 'model-chip-plain': plain, 'model-chip-muted': !linkable(m) && !peek }"
      :to="!peek && linkable(m) ? `/models/${m.slug}` : undefined"
      :type="peek ? 'button' : undefined"
      :title="m.vendor ? `${shownName(m)} · ${m.vendor}` : shownName(m)"
      @click="peek ? emit('peek', m.slug) : undefined"
    >
      <EntityStamp v-if="!plain" :name="m.name" :vendor="m.vendor" size="sm" />
      <span class="model-chip-name">{{ shownName(m) }}</span>
    </component>
    <span v-if="models.length > max" class="model-chip-more" :title="models.slice(max).map(shownName).join(', ')">
      {{ t('models.andNMore', '等 {n} 个', { n: models.length }) }}
    </span>
  </span>
</template>
