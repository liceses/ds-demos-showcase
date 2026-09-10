import { onBeforeUnmount } from 'vue'

/**
 * 全局 body 滚动锁（RF-2）。
 *
 * 背景：SearchOverlay / IframePreview / DemoView 各自直接读写 `document.body.style.overflow`。
 * 谁后卸载谁就把锁清掉，而它并不知道别人还开着锁 ——
 * 实测路径：移动端全屏 iframe 锁滚动 → 打开 ⌘K 搜索（prevOverflow 记成 'hidden'）
 * → 点「重试」重建 iframe → 旧 IframePreview 卸载把 overflow 清空
 * → 搜索覆盖层背后的长页面开始跟着滚。
 *
 * 做法：模块级引用计数 + 首次加锁时保存原值，归零时才还原；
 * 组件侧用 `lock()` / `unlock()` 成对调用，或直接用 `useBodyScrollLock(ref)`。
 */

let holders = 0
let savedOverflow: string | null = null

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (holders === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  holders += 1
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (holders === 0) return // 防重复 unlock 把计数压成负数
  holders -= 1
  if (holders === 0) {
    document.body.style.overflow = savedOverflow ?? ''
    savedOverflow = null
  }
}

/** 当前持有锁的数量（诊断/测试用）。 */
export function bodyScrollLockCount(): number {
  return holders
}

/** 组件内一次性使用：卸载时自动释放（不会误清别人的锁）。 */
export function useBodyScrollLock(): { lock: typeof lockBodyScroll; unlock: typeof unlockBodyScroll } {
  let held = false
  const lock = () => {
    if (held) return
    held = true
    lockBodyScroll()
  }
  const unlock = () => {
    if (!held) return
    held = false
    unlockBodyScroll()
  }
  onBeforeUnmount(unlock)
  return { lock, unlock }
}
