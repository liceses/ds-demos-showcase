import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

export interface ImmersiveChromeOptions {
  /** 进入后多久收起为「锚点」形态（ms）。默认 2500 */
  delay?: number
}

/**
 * 沉浸式 chrome 状态机（预览全屏 / 独立预览页共用）。
 *
 * 背景（用户实测两条）：
 *   · 全屏时站点有三个元素压在 demo 上，其中「退出全屏」按钮与黄提示条**重叠**；
 *   · 独立页三个按钮压在画面上，还把「点击预览后键盘才生效」的提示条压在下面
 *     （根因是 z 序：提示用 --z-overlay:2，按钮用 --z-local:10）。
 *
 * 设计：chrome 只在"刚进入/刚被唤出"时**展开**（带文字标签），随后收起为一个
 * 半透明小锚点；锚点常驻 —— 因为上一轮已把 Esc 让给作品，它是唯一不依赖键盘的出口线索。
 *
 * 为什么不做"指针移入就唤出"：**父文档收不到 iframe 内部的指针移动**
 * （只有 iframe 元素上的 pointerdown 会冒泡上来，现有焦点同步就靠它；
 * 实测指针在 iframe 上时父级 :hover 链为空）。所以唤出只能靠：
 *   ① 悬停/聚焦 chrome 本身；② 点画面一下（pointerdown 冒泡）；③ 按 G。
 *
 * 与 reduced-motion 的关系：这里只管"要不要展开"，过渡与否交给 CSS
 * （CSS 里 prefers-reduced-motion 时改瞬时切换）。
 *
 * **不做 hold/release**（曾有，已删）：靠 @pointerenter/@focus 维护一个 held 布尔值，
 * 一旦出现"enter 了但没配对 leave"（切窗口、指针离开元素后被移走、聚焦后被程序化 blur 掉…）
 * 就**永久卡在展开态** —— 实测症状：进入全屏 3.6s 后 chrome 仍 opacity 1、标签还在（用户报的就是这种"东西一直浮在画面上"）。
 * 现在"悬停/聚焦时保持展开"完全交给 CSS（:hover / :focus-visible），JS 只管计时，无状态可泄漏。
 */
export function useImmersiveChrome(opts: ImmersiveChromeOptions = {}) {
  const delay = opts.delay ?? 2500
  /** true = 展开态（显示文字标签）；false = 只留锚点 */
  const awake = ref(true)
  let timer: ReturnType<typeof setTimeout> | null = null
  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule() {
    clearTimer()
    timer = setTimeout(() => {
      awake.value = false
      timer = null
    }, delay)
  }

  /** 唤出：展开并重新计时 */
  function poke() {
    awake.value = true
    schedule()
  }

  function sleep() {
    clearTimer()
    awake.value = false
  }

  // 初次挂载即开始计时：进入时是展开态，delay 之后收起为锚点（少了这行就永远展开 —— 单测抓到过）
  schedule()

  // 组件外（单测）调用时不注册清理，避免 "no active component instance" 告警
  if (getCurrentInstance()) onBeforeUnmount(clearTimer)

  return { awake, poke, sleep }
}
