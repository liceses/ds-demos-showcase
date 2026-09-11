<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { usePreviewFullscreen } from '../composables/usePreviewFullscreen'
import { useImmersiveChrome } from '../composables/useImmersiveChrome'

// 注意 withDefaults 不是可有可无：Vue 对**布尔型 prop** 有"缺省即 false"的强制转换，
// 写成裸的 `hotkeys?: boolean` 时"调用方没传"会变成 false —— 详情页的 G 热键就静默失效
// （本轮实测踩到：window 收到了 'g'，但处理器从未挂上，defaultPrevented 一直是 false）。
const props = withDefaults(
  defineProps<{
    src?: string
    srcdoc?: string
    title?: string
    /**
     * 是否绑定站点热键（默认 true = 只在详情页这类"浏览中的预览"里绑 G）。
     * 独立预览页传 :hotkeys="false"：那里的目标是"我在玩"，站点一个键都不该碰。
     */
    hotkeys?: boolean
  }>(),
  { hotkeys: true },
)

// M0-B：向宿主透传 iframe @load（DemoView 预览三态的 ready 信号；跨源加载失败浏览器不触发 error，超时兜底在宿主侧）
const emit = defineEmits<{ loaded: [] }>()

const frame = ref<HTMLIFrameElement | null>(null)
const autoHeight = ref<number | null>(null)

// ─────────────────────────────────────────────────────────────────────────────
// 全屏：站内覆盖层，**唯一实现**（composables/usePreviewFullscreen）。
// 这里不再有 requestFullscreen / fullscreenchange / webkitRequestFullscreen ——
// Fullscreen API 保障"全屏态按 Esc 退出全屏"，与"Esc 归 demo 去关自己的菜单"互斥（规范约束），
// 所以全屏只走覆盖层，站点不绑 Esc。
// 覆盖层内**必须有可见退出按钮**：没有 Esc 之后它是唯一可靠出口。
const { isFullscreen, toggle: toggleFullscreen, exit: exitFullscreen } = usePreviewFullscreen()

// 沉浸式 chrome：刚进入/刚被唤出时展开（带「退出全屏」文字），2.5s 后收起为半透明锚点。
// 锚点**常驻**——上一轮把 Esc 让给了作品，它是唯一不依赖键盘的出口线索（护栏钉住它不可 display:none）。
const { awake: chromeAwake, poke: pokeChrome } = useImmersiveChrome()

// 进入全屏时**显式唤出** chrome：不能只靠 pointerdown 冒泡（程序化 click / 键盘触发都没有 pointerdown，
// 而且 composable 的首次计时从组件挂载就开始，进全屏时它早已收起 —— 实测进全屏后 opacity 仍 0.4、无标签）。
watch(isFullscreen, (on) => {
  if (on) pokeChrome()
})

// ─────────────────────────────────────────────────────────────────────────────
// 键盘焦点（docs/预览架构与排坑记录.md 坑五）：demo 的 WASD/Esc 等操作依赖 iframe 内
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
/** 触屏无键盘：不显示键盘提示（(hover:none) 与站点触屏判定同源） */
const hoverCapable = !matchMedia('(hover: none)').matches

// 焦点提示（坑五）改为**一次性居中 toast**：
//   · 原先它是左上角常驻黄条，被 z-index 更高的 chrome 压住（--z-overlay:2 < --z-local:10），
//     用户实测"提示条被按钮遮住"；
//   · 现在：load 后出现，4s 自动消失；用户点进画面（kbFocused 变真）立即消失；
//     本会话提示过一次就不再打扰（sessionStorage）。
const HINT_MS = 4000
const KB_HINT_KEY = 'demo.kbHintShown'
let hintTimer: ReturnType<typeof setTimeout> | null = null
const hintDismissed = ref(false)
try {
  if (sessionStorage.getItem(KB_HINT_KEY) === '1') hintDismissed.value = true
} catch {
  /* 隐私模式：每次都提示也不算错 */
}
const showFocusHint = computed(
  () => hoverCapable && frameLoaded.value && !kbFocused.value && !hintDismissed.value,
)
function dismissHint() {
  if (hintTimer !== null) {
    clearTimeout(hintTimer)
    hintTimer = null
  }
  hintDismissed.value = true
  try {
    sessionStorage.setItem(KB_HINT_KEY, '1')
  } catch {
    /* 存不下就只是下次再提示一次 */
  }
}

function syncFocus() {
  kbFocused.value = !!frame.value && document.activeElement === frame.value
}
function onShellPointerDown() {
  // 指针按下之后浏览器才执行「聚焦」默认动作：本帧末 + 稍后各校准一次（不引轮询）
  setTimeout(syncFocus, 0)
  setTimeout(syncFocus, 150)
  // 点画面（含点在 iframe 上）也短暂唤出 chrome —— pointerdown 会冒泡到本元素，
  // 且不 preventDefault，游戏照常收到这次点击。这是"移入唤出"不可行（见 useImmersiveChrome 注释）之后的替代路径。
  pokeChrome()
}
function onFrameLoad() {
  frameLoaded.value = true
  syncFocus()
  emit('loaded')
  // 首次加载后给 4s 的提示窗口，然后自动收起（不再常驻）
  if (!hintDismissed.value && hintTimer === null) hintTimer = setTimeout(dismissHint, HINT_MS)
}

// sandbox：预览源与本站不同源（如 demo.deepdemos.top / OSS 直链）时，加 allow-same-origin，
// 让 demo 的 localStorage / 相对 fetch / Worker 可用且彼此隔离在预览源内；
// 同源或 srcdoc（Mock）保持不透明 origin 不放行，防止上传的 demo 读本站 Cookie/存储。
// allow-pointer-lock：3D 游戏（如我的世界）用 Pointer Lock 控制视角/移动，缺它 requestPointerLock 会被拒。
const sandboxAttr = computed(() => {
  // 注意：不带 allow-fullscreen（浏览器提示其为非法 sandbox flag）
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
  if (isFullscreen.value) return { height: '100%' }
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

/**
 * 站点热键：**只保留 G**（切换覆盖层）。
 *
 * 刻意**不绑 Escape**：很多 demo 用 Esc 关自己的菜单，站点一旦绑了它，用户按 Esc
 * 想关游戏菜单却变成"站点退全屏"（用户实测报的就是这条）。退出全屏改由
 * 覆盖层内的可见按钮 + G 承担。
 *
 * 焦点事实（坑五）：iframe 持焦点时父文档收不到 keydown，所以这里的 G 只在
 * "用户没在操作 demo"时生效 —— 天然不会跟 demo 抢键。
 */
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && target.closest('input, textarea, select, [contenteditable]')) return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key.toLowerCase() === 'g') {
    e.preventDefault()
    if (isFullscreen.value) toggleFullscreen()
    else {
      toggleFullscreen()
      pokeChrome()
    }
  }
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  // 独立预览页传 :hotkeys="false" —— 那里一个键都不绑
  if (props.hotkeys !== false) window.addEventListener('keydown', onKeydown)
  // 焦点进出预览（含焦点移到 iframe / 回到父页面 / 切走窗口）都要重算提示
  window.addEventListener('focus', syncFocus)
  window.addEventListener('blur', syncFocus)
  document.addEventListener('focusin', syncFocus)
  document.addEventListener('focusout', syncFocus)
  syncFocus()
})

onBeforeUnmount(() => {
  if (hintTimer !== null) clearTimeout(hintTimer)
  window.removeEventListener('message', onMessage)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('focus', syncFocus)
  window.removeEventListener('blur', syncFocus)
  document.removeEventListener('focusin', syncFocus)
  document.removeEventListener('focusout', syncFocus)
})

// 供宿主（DemoView 的动作条 / 预览角按钮、独立预览页）调用。
// 全屏状态共用一个来源，宿主不再自己维护 nativeFs/fakeFs 两套状态。
defineExpose({ toggleFullscreen, exitFullscreen, isFullscreen })
</script>

<template>
  <div
    class="preview-shell"
    :class="{ 'web-fullscreen': isFullscreen }"
    @pointerdown="onShellPointerDown"
  >
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
      @load="onFrameLoad"
    ></iframe>

    <!-- 右上角唯一控件，两态：
           展开（刚进入/刚唤出 2.5s）= 带「退出全屏」文字；收起 = 半透明小锚点（hover/聚焦时展开）。
         锚点常驻 —— 站点不绑 Esc 之后它是唯一不依赖键盘的出口线索（护栏：不可 display:none）。
         它也是**唯一**压在画面上的站点元素：原先同时存在的 .preview-fs-exit 与 .preview-hint
         在右上角互相重叠（实测 rect 相交），.preview-hint 已删（按钮 title 已说明 G）。 -->
    <button
      v-if="isFullscreen"
      class="preview-chrome"
      :class="{ 'is-awake': chromeAwake }"
      type="button"
      :title="t('demo.fsExitTip', '退出全屏（或按 G）')"
      :aria-label="t('demo.barExitFs', '退出全屏')"
      @click="exitFullscreen"
    >
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" fill="none" stroke="currentColor" stroke-width="2" />
      </svg>
      <!-- 标签常驻 DOM，显隐交给 CSS（.is-awake / :hover / :focus-visible）——
           这样"悬停时保持展开"不需要 JS 维护任何状态，也就不会泄漏成"永远展开"。 -->
      <span class="preview-chrome-label">{{ t('demo.barExitFs', '退出全屏') }}</span>
    </button>

    <!-- 键盘焦点提示（坑五）：一次性居中 toast。pointer-events:none，点击穿透到 iframe
         —— 真实点击才交得出键盘焦点。4s 自动消失 / 点进画面立即消失 / 本会话只提示一次。
         居中而非左上角：既不与右上角 chrome 抢位置，也不会被压住。 -->
    <div v-if="showFocusHint" class="preview-kb-toast mono" aria-hidden="true">
      {{ t('demo.previewKbHint', '点击预览后，键盘操作才生效') }}
    </div>
  </div>
</template>
