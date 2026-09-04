<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTagsStore } from '../stores/tags'
import { t } from '../i18n'

/**
 * TagTip：标签介绍悬浮消费（03 §13.1 M0「有引擎没方向盘」清单 #5）。
 * - 数据来源：stores/tags 现有缓存（tag-keys 的 values[].description，回落 key.description）；
 *   调用方已持有 description 时走直传 prop，零额外查找与请求。
 * - 桌面：悬停/聚焦 chip 即出浮卡（stamp-in 微档出场，--b-dur/--b-ease 走全局令牌）；
 *   触屏：无 hover 语义，chip 内出现「i」小触点（span[role=button]，click.stop 不干扰父 chip 行为）。
 * - 无介绍时只渲染插槽本体（不加点、不占位）。
 * - 样式组件级（scoped），不动全局 style.css（P1 拆迁前冻结）。
 */
const props = defineProps<{
  tagKey: string
  value?: string
  /** 调用方已持有的介绍（TagKeyValue.description / TagKeyInfo.description）——直传免查 store */
  description?: string
}>()

const store = useTagsStore()
const open = ref(false)

// 缓存式加载：已加载零请求；未加载借既有 listTagKeys 单例（与 UploadView/TagPicker 共享同一份）
onMounted(() => {
  void store.load()
})

const desc = computed(() => {
  if (props.description && props.description.trim()) return props.description.trim()
  const k = store.keys.find((x) => x.key === props.tagKey)
  if (!k) return ''
  const v = props.value ? k.values.find((x) => x.value === props.value) : undefined
  return (v?.description || k.description || '').trim()
})

const has = computed(() => desc.value.length > 0)

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <slot v-if="!has" />
  <span v-else class="tag-tip" :class="{ open }">
    <slot />
    <span
      class="tag-tip-dot"
      role="button"
      tabindex="0"
      :aria-label="t('tagtip.show', '查看标签介绍')"
      @click.stop.prevent="toggle"
      @mousedown.stop
      @keydown.enter.stop.prevent="toggle"
      @keydown.space.stop.prevent="toggle"
    >i</span>
    <span class="tag-tip-card" role="tooltip">{{ desc }}</span>
  </span>
</template>

<style scoped>
.tag-tip {
  position: relative;
  display: inline-flex;
  align-items: center;
}
/* 触点仅触屏显示：hover 设备走 wrapper 悬停/聚焦，零视觉噪音 */
.tag-tip-dot {
  display: none;
}
@media (hover: none) {
  .tag-tip-dot {
    display: inline-grid;
    place-items: center;
    width: 14px;
    height: 14px;
    margin-left: 2px;
    border: 1.5px solid currentColor;
    border-radius: 50%; /* 装饰圆豁免 */
    font: 700 9px/1 var(--font-body, ui-monospace, monospace);
    cursor: pointer;
    opacity: 0.72;
    vertical-align: middle;
    flex: none;
  }
}
.tag-tip-card {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 60; /* token 化前的临时层级（对齐 --z-modal 段位） */
  max-width: 260px;
  padding: 8px 10px;
  border: 2px solid var(--ink, #000);
  background: var(--paper, #fff);
  color: var(--ink, #000);
  box-shadow: 3px 3px 0 0 rgba(0, 0, 0, 1);
  font-family: var(--font-body, ui-monospace, monospace);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.55;
  letter-spacing: 0;
  text-transform: none;
  text-align: left;
  white-space: normal;
  display: none;
}
.tag-tip:hover .tag-tip-card,
.tag-tip:focus-within .tag-tip-card,
.tag-tip.open .tag-tip-card {
  display: block;
  animation: tt-in var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1)) both;
}
/* stamp-in 微档（与全局 b-stamp-in 同形；局部定义以便组件级冻结纪律下自洽） */
@keyframes tt-in {
  0% {
    transform: scale(1.06) rotate(-1.2deg);
  }
  60% {
    transform: scale(0.985) rotate(0.4deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tag-tip-card {
    animation: none;
  }
}
</style>
