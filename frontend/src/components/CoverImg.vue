<script setup lang="ts">
/**
 * 封面图的**唯一出口**（全站图片都走它）。
 *
 * 做三件事：
 *  ① 按显示尺寸选档：thumb(200) / card(640) / full(原图)；
 *  ② 有 sizes 时输出 srcset 阶梯（200w/640w/1280w），让浏览器自己按 DPR 与布局挑 —— 零 JS 选档；
 *  ③ **降级链**：所选档 404（例如回填还没跑）→ 退回原图 → 仍失败就不渲染（各页面自己的空态接管）。
 *
 * 为什么不用 `<img :src>` 直接写 URL：站内 14 处上下文尺寸从 34px 到整宽都有，
 * 而原图是 1280px / 平均 63KB —— 个人主页实测 23 张图 1510KB，其中绝大多数显示不到 100px。
 */
import { computed, ref, watch } from 'vue'
import { coverSrcset, sizedCoverUrl, type CoverTier } from '../utils/coverUrl'

const props = withDefaults(
  defineProps<{
    /** 原图 URL（后端返回的 cover_url / cover_urls[] 元素；本机历史里存的也是它） */
    src?: string | null
    tier?: CoverTier
    /** 配合 srcset 用：该上下文里图片的显示宽度，如 "(max-width:720px) 50vw, 300px" */
    sizes?: string
    alt?: string
    /** 首屏大图（首页 hero）用 eager，其余保持 lazy */
    eager?: boolean
  }>(),
  { tier: 'thumb', sizes: '', alt: '', eager: false },
)

// **必须声明 emits**：否则父组件写的 `@error` 会被当成原生事件挂到根元素上，
// 于是"card 档 404"这一步就把父组件的空态触发了 —— 降级链（card → 原图 → 空态）根本没机会走。
// 声明之后：原生 error 由本组件内部消化，链路走完才 emit 给父组件。
const emit = defineEmits<{ error: [] }>()

const broken = ref(false)
const fullBroken = ref(false)
watch(
  () => props.src,
  () => {
    broken.value = false
    fullBroken.value = false
  },
)

const full = computed(() => (props.src || '').trim())
const sized = computed(() => sizedCoverUrl(full.value, props.tier))
/** 原图档 / 没有小图 / 小图 404 → 都用原图；原图也 404 → 不渲染（父组件空态接管） */
const useFull = computed(() => props.tier === 'full' || !sized.value || broken.value)
const resolvedSrc = computed(() => (useFull.value ? full.value : sized.value))
const resolvedSrcset = computed(() => (useFull.value || !props.sizes ? '' : coverSrcset(full.value)))

function onError() {
  if (props.tier !== 'full' && sized.value && !broken.value) {
    broken.value = true // 第一跳：小图挂了 → 换原图（常见于回填还没跑）
    return
  }
  fullBroken.value = true // 第二跳：原图也挂了 → 交给父组件的空态
  emit('error')
}
</script>

<template>
  <img
    v-if="full && !fullBroken"
    :src="resolvedSrc"
    :srcset="resolvedSrcset || undefined"
    :sizes="resolvedSrcset ? sizes : undefined"
    :alt="alt"
    :loading="eager ? 'eager' : 'lazy'"
    decoding="async"
    @error="onError"
  />
</template>
