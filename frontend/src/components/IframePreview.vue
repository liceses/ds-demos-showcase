<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useUiStore } from '../stores/ui'
import { t } from '../i18n'
import { lockBodyScroll, unlockBodyScroll } from '../composables/useBodyScrollLock'

const props = defineProps<{
  src?: string
  srcdoc?: string
  title?: string
}>()

// M0-B：向宿主透传 iframe @load（DemoView 预览三态的 ready 信号；跨源加载失败浏览器不触发 error，超时兜底在宿主侧）
const emit = defineEmits<{ loaded: [] }>()

const ui = useUiStore()

const frame = ref<HTMLIFrameElement | null>(null)
const autoHeight = ref<number | null>(null)
const webFullscreen = ref(false)

// ─────────────────────────────────────────────────────────────────────────────
// 键盘焦点（docs/预览架构与排坑记录.md 坑五）：demo 的 WASD 等操作依赖 iframe 内
// window 的 keydown，而键盘事件只送到「持有焦点的文档」。跨源预览 iframe 默认没有焦点，
// 于是 WASD 静默失效（点一下预览才恢复）。实测结论（CDP 探针，Edge 152）：
//   · 父页面持焦点 → iframe 内的 keydown 监听收不到（input.keys 无变化）
//   · 用户真实点击预览 → 焦点进入 iframe → 按键生效
//   · 程序化 iframe.focus() → document.hasFocus() 变 true，但按键仍不生效 ⇒ 不可依赖
// 因此这里**不抢焦点**，只做诚实提示：提示层 pointer-events:none，点击穿透到 iframe
// 本身（真实点击＝浏览器原生交焦点）。判定式=父文档 activeElement 指向 iframe 元素，
// 事件只作触发器（window focus/blur + document focusin/focusout + 指针按下后校准）。
const kbFocused = ref(false)
const frameLoaded = ref(false)
/** 触屏无键盘：不显示该提示（(hover:none) 与站点触屏判定同源） */
const hoverCapable = !matchMedia('(hover: none)').matches
const showFocusHint = computed(() => hoverCapable && frameLoaded.value && !kbFocused.value)

function syncFocus() {
  kbFocused.value = !!frame.value && document.activeElement === frame.value
}
function onShellPointerDown() {
  // 指针按下之后浏览器才执行「聚焦」默认动作：本帧末 + 稍后各校准一次（不引轮询）
  setTimeout(syncFocus, 0)
  setTimeout(syncFocus, 150)
}
function onFrameLoad() {
  frameLoaded.value = true
  syncFocus()
  emit('loaded')
}

// sandbox：预览源与本站不同源（如 demo.deepdemos.top / OSS 直链）时，加 allow-same-origin，
// 让 demo 的 localStorage / 相对 fetch / Worker 可用且彼此隔离在预览源内；
// 同源或 srcdoc（Mock）保持不透明 origin 不放行，防止上传的 demo 读本站 Cookie/存储。
// allow-pointer-lock：3D 游戏（如我的世界）用 Pointer Lock 控制视角/移动，缺它 requestPointerLock 会被拒。
const sandboxAttr = computed(() => {
  // 注意：不带 allow-fullscreen（浏览器提示其为非法 sandbox flag；全屏由 allowfullscreen + allow="fullscreen" 提供）
  const base = 'allow-scripts allow-modals allow-forms allow-popups allow-pointer-lock'
  if (props.src) {
    try {
      const u = new URL(props.src, window.location.href)
      if (u.origin !== window.location.origin) return `${base} allow-same-origin`
    } catch {
      // 非法 URL 按同源/收紧处理
    }
  }
  return base
})

const frameStyle = computed(() => {
  if (webFullscreen.value) return { height: '100%' }
  if (autoHeight.value) return { height: autoHeight.value + 'px' }
  return undefined
})

// 给 srcdoc（Mock 模式可控内容）注入：
// 1. 基础响应式样式：防横向滚动条，canvas/img/video 收缩适配
// 2. 自适应高度脚本：内容高度变化时向父页面 postMessage，父页面据此撑高 iframe
const RESPONSIVE_STYLE = `<style>
html,body{max-width:100%;overflow-x:hidden}
canvas,img,video{max-width:100%;height:auto}
</style>`

// 收尾标签拼接而成：源码里一旦出现裸的收尾序列，.vue 的 script 块会被 SFC 解析器提前截断；
// 而写成 \/ 转义又会触发 no-useless-escape 误报 —— 拼接是同时满足两者的唯一写法。
const CLOSE_SCRIPT = '</scr' + 'ipt>'

const RESIZE_SCRIPT = `<script>
/* dsh auto-resize */
!function(){
  function report(){
    try{
      var h = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
      window.parent.postMessage({type:'dsh-resize',height:h},'*');
    }catch(e){}
  }
  window.addEventListener('load',report);
  window.addEventListener('resize',report);
  setTimeout(report,120);
  setInterval(report,1000);
}();
${CLOSE_SCRIPT}`

const finalSrcdoc = computed(() => {
  const html = props.srcdoc || ''
  if (!html) return ''
  let out = html
  if (out.includes('</head>')) {
    out = out.replace('</head>', RESPONSIVE_STYLE + '</head>')
  }
  if (out.includes('</body>')) {
    out = out.replace('</body>', RESIZE_SCRIPT + '</body>')
  } else {
    out += RESIZE_SCRIPT
  }
  return out
})

function onMessage(e: MessageEvent) {
  const data = e.data as { type?: string; height?: unknown } | null
  if (data && data.type === 'dsh-resize' && typeof data.height === 'number') {
    autoHeight.value = Math.max(240, Math.min(Math.round(data.height), 6000))
  }
}

async function toggleIframeFullscreen() {
  const el = frame.value
  if (!el) return

  // 已在全屏 → 退出
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen()
    } catch {
      /* 忽略退出失败 */
    }
    return
  }

  try {
    await el.requestFullscreen()
    return
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    // 兼容旧版 WebKit（Safari 前缀方法）
    const legacy = el as HTMLIFrameElement & { webkitRequestFullscreen?: () => Promise<void> }
    if (legacy.webkitRequestFullscreen) {
      try {
        await legacy.webkitRequestFullscreen()
        return
      } catch {
        /* 旧前缀也被拒，继续降级 */
      }
    }
    // 环境（如外层预览面板沙箱未放行 allow="fullscreen"）拒绝 iframe 全屏：
    // 不再静默，降级为网页全屏覆盖层并明确告知原因
    webFullscreen.value = true
    lockBodyScroll()
    ui.toast(`iframe 全屏被浏览器拒绝（${reason}），已切换为网页全屏`, 'info')
  }
}

async function toggleWebFullscreen() {
  webFullscreen.value = !webFullscreen.value
  // RF-2：走引用计数锁，避免卸载时把别人的锁（如搜索覆盖层）一起清掉
  if (webFullscreen.value) lockBodyScroll()
  else unlockBodyScroll()
}

function exitWebFullscreen() {
  if (webFullscreen.value) {
    webFullscreen.value = false
    unlockBodyScroll()
  }
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && target.closest('input, textarea, select, [contenteditable]')) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const key = e.key.toLowerCase()
  if (key === 'f') {
    e.preventDefault()
    void toggleIframeFullscreen()
  } else if (key === 'g') {
    e.preventDefault()
    toggleWebFullscreen()
  } else if (key === 'escape' && webFullscreen.value) {
    exitWebFullscreen()
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  window.addEventListener('keydown', onKeydown)
  // 焦点进出预览（含焦点移到 iframe / 回到父页面 / 切走窗口）都要重算提示
  window.addEventListener('focus', syncFocus)
  window.addEventListener('blur', syncFocus)
  document.addEventListener('focusin', syncFocus)
  document.addEventListener('focusout', syncFocus)
  syncFocus()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('focus', syncFocus)
  window.removeEventListener('blur', syncFocus)
  document.removeEventListener('focusin', syncFocus)
  document.removeEventListener('focusout', syncFocus)
  // RF-2：只释放自己持有的那一次锁（旧写法无条件清空，会解掉搜索覆盖层等别人的锁）
  if (webFullscreen.value) unlockBodyScroll()
})
</script>

<template>
  <div class="preview-shell" :class="{ 'web-fullscreen': webFullscreen }" @pointerdown="onShellPointerDown">
    <iframe
      ref="frame"
      class="preview-frame"
      :src="src"
      :srcdoc="finalSrcdoc || undefined"
      :title="title || 'Demo 预览'"
      :style="frameStyle"
      :sandbox="sandboxAttr"
      allowfullscreen
      allow="fullscreen"
      loading="eager"
      @dblclick="toggleIframeFullscreen"
      @load="onFrameLoad"
    ></iframe>
    <!-- 键盘焦点提示（坑五）：pointer-events:none，点击穿透到 iframe —— 真实点击才交得出焦点 -->
    <div v-if="showFocusHint" class="preview-focus-hint mono" aria-hidden="true">
      {{ t('demo.previewKbHint', '点击预览后，键盘操作才生效') }}
    </div>
    <div class="preview-hint mono">
      {{ webFullscreen ? '按 G / ESC 退出网页全屏' : '按 F 全屏 · 按 G 网页全屏 · ESC 退出' }}
    </div>
  </div>
</template>
