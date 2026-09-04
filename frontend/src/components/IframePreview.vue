<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useUiStore } from '../stores/ui'

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
    document.body.style.overflow = 'hidden'
    ui.toast(`iframe 全屏被浏览器拒绝（${reason}），已切换为网页全屏`, 'info')
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
      :sandbox="sandboxAttr"
      allowfullscreen
      allow="fullscreen"
      loading="eager"
      @dblclick="toggleIframeFullscreen"
      @load="emit('loaded')"
    ></iframe>
    <div class="preview-hint mono">
      {{ webFullscreen ? '按 G / ESC 退出网页全屏' : '按 F 全屏 · 按 G 网页全屏 · ESC 退出' }}
    </div>
  </div>
</template>
