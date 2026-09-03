<script setup lang="ts">
// 实体印章（v2）：模型/题目共用的视觉身份——首字方块章，新野兽派原生语汇。
// 显示层走 tagLabel（fun 模式 ds-unknown → astra-canary 首字母同步变化）。
// 有本地图标的厂商用**原版品牌色图标 + 纸白底**；其余保留字母章（不伪造品牌标识）。
// 注：此前按厂商名哈希挑 5 个粉彩色（vendorColor），既不是品牌色也不稳定（改名即换色），
// 已按决策人要求移除 —— 颜色不再承载任何真实信息，去掉反而更诚实。
import { computed, ref, watch } from 'vue'
import { tagLabel } from '../utils/funMode'
import { vendorLogo } from '../utils/vendorLogos'

const props = withDefaults(
  defineProps<{
    name: string
    vendor?: string | null
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { vendor: null, size: 'md' },
)

const letter = computed(() => {
  const shown = tagLabel(props.name) || '?'
  return shown.slice(0, 1).toUpperCase()
})

const logo = computed(() => vendorLogo(props.vendor))
// 图标文件缺失/加载失败 → 退回字母章，绝不留空白方块
const logoFailed = ref(false)
watch(logo, () => (logoFailed.value = false))
const showLogo = computed(() => !!logo.value && !logoFailed.value)
</script>

<template>
  <span class="entity-stamp" :class="['stamp-' + size, { 'has-logo': showLogo }]" aria-hidden="true">
    <img v-if="showLogo" :src="logo ?? undefined" :alt="vendor || ''" class="stamp-logo" @error="logoFailed = true" />
    <template v-else>{{ letter }}</template>
  </span>
</template>
