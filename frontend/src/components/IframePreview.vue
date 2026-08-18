<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  src?: string
  srcdoc?: string
  title?: string
}>()

const frame = ref<HTMLIFrameElement | null>(null)
const autoHeight = ref<number | null>(null)
const webFullscreen = ref(false)

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
<\/script>`

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
  try {
    if (document.fullscreenElement === el) {
      await document.exitFullscreen()
    } else if (!document.fullscreenElement) {
      await el.requestFullscreen()
    }
  } catch {
    // 兼容旧版 WebKit
    const legacy = el as HTMLIFrameElement & { webkitRequestFullscreen?: () => Promise<void> }
    if (!document.fullscreenElement && legacy.webkitRequestFullscreen) {
      await legacy.webkitRequestFullscreen()
    }
  }
}

async function toggleWebFullscreen() {
  webFullscreen.value = !webFullscreen.value
  document.body.style.overflow = webFullscreen.value ? 'hidden' : ''
}

function exitWebFullscreen() {
  if (webFullscreen.value) {
    webFullscreen.value = false
    document.body.style.overflow = ''
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
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="preview-shell" :class="{ 'web-fullscreen': webFullscreen }">
    <iframe
      ref="frame"
      class="preview-frame"
      :src="src"
      :srcdoc="finalSrcdoc || undefined"
      :title="title || 'Demo 预览'"
      :style="frameStyle"
      sandbox="allow-scripts allow-modals allow-forms allow-popups allow-fullscreen"
      allowfullscreen
      allow="fullscreen"
      loading="eager"
      @dblclick="toggleIframeFullscreen"
    ></iframe>
    <div class="preview-hint mono">
      {{ webFullscreen ? '按 G / ESC 退出网页全屏' : '按 F 全屏 · 按 G 网页全屏 · ESC 退出' }}
    </div>
  </div>
</template>
