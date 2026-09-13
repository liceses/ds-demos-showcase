<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../i18n'

/**
 * 「加载更多」统一控件（P2-d）。
 *
 * 收敛前这一支有 5 处各写各的：HomeView 拼「加载更多（x/y）」、ModelDetailView 拼
 * 「再显示 N 件」、TagDetailView/UserView/PublicView **根本没有**（只发一次 page_size=50
 * 就结束，第 51 件起静默消失）。
 *
 * 三态：
 *  · 还有更多  → 按钮（显示"已显示 x / 共 y"），禁用态由 loading 控制
 *  · 已到底    → 给一行轻提示（否则用户不知道"没有更多"还是"按钮坏了"）
 *  · 首屏加载中 → 一行 loading（列表为空时才有意义，由调用方决定是否渲染）
 *
 * P4 补充：后端有的列表接口返回**裸数组、没有 total**（如 GET /notifications），
 * 此时 shown<total 判不出"还有更多"，由调用方用 hasMore 显式传入自己的口径
 * （满页 / 服务端计数）。
 */
const props = withDefaults(
  defineProps<{
    shown: number
    total: number
    loading?: boolean
    /** 单页步进（用于"再显示 N 件"这类文案） */
    step?: number
    /** 已到底时是否显示提示（默认显示） */
    showEnd?: boolean
    /** 显式覆盖"还有更多"（接口无 total 时用） */
    hasMore?: boolean
  }>(),
  { loading: false, showEnd: true },
)

const emit = defineEmits<{ more: [] }>()

const more = computed(() => props.hasMore ?? props.shown < props.total)
</script>

<template>
  <div class="load-more">
    <button
      v-if="more"
      class="btn btn-sm btn-outline"
      type="button"
      :disabled="loading"
      @click="emit('more')"
    >
      {{
        loading
          ? t('common.loading', '加载中…')
          : step
            ? t('common.loadMoreStep', '再显示 {n} 件', { n: step })
            : t('common.loadMore', '加载更多')
      }}
      <span v-if="!loading" class="load-more-count mono">{{ shown }} / {{ total }}</span>
    </button>
    <p v-else-if="showEnd && shown > 0" class="load-more-end muted">
      <!-- 已到底的文案可覆盖：首页要的是「查看全部 →」链接、模型页要的是带提示的到底行 -->
      <slot name="end">{{ t('common.allLoaded', '已全部加载（{n} 件）', { n: shown }) }}</slot>
    </p>
  </div>
</template>

<style scoped>
.load-more {
  display: flex;
  justify-content: center;
  padding: 18px 0 var(--sp-4);
}
.load-more-count {
  margin-left: var(--sp-8);
  font-size: var(--fs-11);
  opacity: 0.75;
}
.load-more-end {
  margin: 0;
  font-size: var(--fs-12);
}
</style>
