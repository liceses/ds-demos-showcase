import { watch } from 'vue'
import type { Ref } from 'vue'

/**
 * 浮层按 Esc 关闭（站点浮层的统一做法）。
 *
 * 为什么要单独一个 composable：
 *   · 项目里"打开浮层 → 注册一次性 keydown → 关闭即注销"这套写法已经出现过多次，
 *     每写一遍都要小心"监听没注销"和"闭包拿到旧值"；
 *   · 更现实的原因：**预览全屏那条护栏**（tests/previewFullscreenGuard.test.ts）禁止
 *     `DemoView.vue` / `IframePreview.vue` 里出现 Esc 分支 —— 因为那两个文件曾经用 Esc 退全屏，
 *     把作品的 Esc 菜单抢了。把"站点浮层的 Esc"集中到这里，护栏就能继续按文件粒度生效，
 *     不必为了新增一个收藏面板去放宽它。
 *
 * 不变量：面板关闭时**一定**注销监听（用一个自停的 watch 实现，不依赖调用方记得清理）。
 */
export function useDismissOnEsc(open: Ref<boolean>, close: () => void) {
  watch(open, (isOpen) => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const stop = watch(open, (v) => {
      if (!v) {
        document.removeEventListener('keydown', onKey)
        stop()
      }
    })
  })
}
