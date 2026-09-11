import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from './useBodyScrollLock'

export interface PreviewFullscreenOptions {
  /**
   * 锁的实现注入点：默认就是全局引用计数锁（useBodyScrollLock）。
   * 之所以可注入，是为了让单测在 **node 环境**（本仓测试不建 DOM）里也能跑。
   */
  lock?: () => void
  unlock?: () => void
}

/**
 * 预览全屏 —— **唯一实现**（站内覆盖层，不请求原生全屏）。
 *
 * 为什么放弃原生全屏（`requestFullscreen`）：Fullscreen API 保障"全屏态按 Esc 退出全屏"，
 * 网页能收到 keydown 但 `preventDefault` 拦不住这次退出。而很多 demo 用 Esc 关自己的菜单，
 * 于是出现"我按 Esc 想关游戏菜单，却是站点退了全屏"。**原生全屏与"Esc 归 demo"在规范上互斥**，
 * 所以这里只做覆盖层：给目标元素加 `.web-fullscreen`（`position:fixed; inset:0`），
 * 站点**不绑 Esc**（Esc 要么被 demo 收到，要么什么都不做）。
 *
 * 收敛前的状态（两套并存，退出方式各不同）：
 *   · `DemoView` 自己的 `nativeFs`/`fakeFs` + `.dv-stage--fs` + `.dv-fs-exit`
 *   · `IframePreview` 的 `webFullscreen` + `.preview-shell.web-fullscreen`（退出只有 G/Esc，**没有可见按钮**）
 * 现在两套合并为本 composable，并且**覆盖层内必须有可见退出按钮** ——
 * 没有 Esc 之后，按钮是唯一可靠出口。
 *
 * 顺带清掉的死状态：`document.fullscreenElement` / `fullscreenchange` 监听
 * （原生退场后不再需要，UI 只有一个 `isFullscreen`）。
 */
export function usePreviewFullscreen(opts: PreviewFullscreenOptions = {}) {
  const lock = opts.lock ?? lockBodyScroll
  const unlock = opts.unlock ?? unlockBodyScroll

  const isFullscreen = ref(false)
  /** 本次是否持锁（保证成对；也避免卸载时误清别人的锁 —— RF-2 的既有教训） */
  let holding = false

  function enter() {
    if (isFullscreen.value) return
    isFullscreen.value = true
    if (!holding) {
      holding = true
      lock()
    }
  }

  function exit() {
    if (!isFullscreen.value) return
    isFullscreen.value = false
    releaseLock()
  }

  function toggle() {
    if (isFullscreen.value) exit()
    else enter()
  }

  function releaseLock() {
    if (!holding) return
    holding = false
    unlock()
  }

  // 仅在组件上下文里注册卸载清理：这样单测（node 环境、无组件实例）可以直接调用本 composable，
  // 不会触发 "onBeforeUnmount is called when there is no active component instance" 告警。
  if (getCurrentInstance()) onBeforeUnmount(releaseLock)

  return { isFullscreen, enter, exit, toggle }
}
