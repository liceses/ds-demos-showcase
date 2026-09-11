<script setup lang="ts">
import { t } from '../i18n'

/**
 * 统一的"空/错误/不存在"占位件（P2 跨页收敛）。
 *
 * 收敛前的现状（实测）：`<EmptyBox>` 组件 6 处、手写 `div.empty-box` 20+ 处、
 * 定制空态 3 处。更麻烦的是**语义被混用**：接口挂了也渲染成 empty-box
 * （`AdminUsersSection` 的 `catch { users.value = [] }` 让 0 用户与"请求失败"
 * 长得一模一样 —— 运维会以为库空了）。
 *
 * 所以这里把三种语义分开，并给 error 态一个**必须有出口**的重试：
 *   empty    无数据（中性）
 *   error    加载失败（role=alert + 重试按钮）
 *   notfound 目标不存在（中性偏冷，通常配返回入口）
 */
withDefaults(
  defineProps<{
    text?: string
    kind?: 'empty' | 'error' | 'notfound'
    /** error 态的重试按钮文案 */
    retryText?: string
    /** 不传 retry 事件时，error 态不渲染按钮（例如调用方自己给了 action 插槽） */
    hideRetry?: boolean
  }>(),
  { kind: 'empty' },
)

const emit = defineEmits<{ retry: [] }>()

function fallbackText(kind: string): string {
  if (kind === 'error') return t('common.loadFailed', '加载失败')
  if (kind === 'notfound') return t('common.notFound', '不存在')
  return t('common.empty', '暂无数据')
}
</script>

<template>
  <div
    class="empty-box"
    :class="`empty-box--${kind}`"
    :role="kind === 'error' ? 'alert' : undefined"
  >
    <p class="empty-box-text">{{ text || fallbackText(kind) }}</p>
    <div v-if="$slots.action || (kind === 'error' && !hideRetry)" class="empty-box-action">
      <slot name="action">
        <button
          v-if="kind === 'error' && !hideRetry"
          class="btn btn-sm btn-outline"
          type="button"
          @click="emit('retry')"
        >
          {{ retryText || t('common.retry', '重试') }}
        </button>
      </slot>
    </div>
  </div>
</template>
