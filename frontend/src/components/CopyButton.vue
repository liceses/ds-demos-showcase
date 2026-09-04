<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { t } from '../i18n'

/**
 * CopyButton 复制按钮微组件（03 §12.5 复制 stamp 语汇；t21 追加）。
 * - 点击复制 text（支持 getter 惰性取值）→ 按钮短暂变「已复制」（stamp-in 微档，1.5s 复原，
 *   03 规格 900ms~2s 档取中）；失败静默（不弹 toast 打断——按钮原样可再点）。
 * - navigator.clipboard 优先（安全上下文）；非安全上下文/拒绝 → execCommand textarea 兜底。
 * - 全站可复用（DemoView 提示词块/严格复现 PROMPT 首批接入；替代散落的裸 clipboard 调用的候补）。
 */
const props = defineProps<{
  text: string | (() => string)
  /** 按钮文案（缺省「复制」；i18n 键 copy.copy） */
  label?: string
}>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

async function copy() {
  const value = (typeof props.text === 'function' ? props.text() : props.text) ?? ''
  if (!value) return
  let ok = false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value)
      ok = true
    }
  } catch {
    ok = false
  }
  if (!ok) ok = fallbackCopy(value)
  if (ok) {
    copied.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      copied.value = false
    }, 1500)
  }
}

function fallbackCopy(value: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
</script>

<template>
  <button
    class="copy-btn"
    :class="{ done: copied }"
    type="button"
    :title="copied ? t('copy.done', '已复制') : t('copy.copy', '复制')"
    @click="copy"
  >
    <span v-if="copied" class="copy-btn-stamp">{{ t('copy.done', '已复制') }}</span>
    <span v-else>{{ label || t('copy.copy', '复制') }}</span>
  </button>
</template>

<style scoped>
/* R6/R7 物理齐全：hover 换色 0ms（色切不进 transition）；active 压平=影偏移+0ms；静止零倾斜 */
.copy-btn {
  display: inline-block;
  font-family: var(--font-body, monospace);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  background: var(--paper, #fff);
  border: 2px solid var(--ink, #000);
  color: var(--ink, #000);
  box-shadow: 2px 2px 0 0 var(--ink, #000);
  cursor: pointer;
  white-space: nowrap;
  transform: rotate(0deg); /* R8 静止零倾斜 */
  transition:
    transform var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1)),
    box-shadow var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1)),
    background-color 0ms,
    color 0ms;
}
@media (hover: hover) {
  .copy-btn:hover {
    background: var(--yellow, #ffe66d);
    color: var(--on-accent, #000);
  }
}
.copy-btn:active {
  transform: translate(2px, 2px);
  box-shadow: none;
  transition-duration: 0ms;
}
.copy-btn.done {
  background: var(--mint, #95e1d3);
  color: var(--on-accent, #000);
}
.copy-btn-stamp {
  display: inline-block;
  animation: copy-stamp-in var(--b-dur, 150ms) var(--b-ease, cubic-bezier(0, 0, 0.2, 1)) both;
}
@keyframes copy-stamp-in {
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
  .copy-btn {
    transition: none;
  }
  .copy-btn-stamp {
    animation: none;
  }
}
</style>
