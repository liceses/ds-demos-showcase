// 预览全屏 + 键盘归属的护栏（fs 扫描，node 环境，进 CI）
//
// 用户实测报过：「很多 demo 需要 Esc 退出菜单，而用户一按 Esc 却是退出全屏」。
// 根因是站点在父文档绑了 Esc 去退全屏，而 Fullscreen API 又保障"全屏态按 Esc 退出全屏" ——
// **原生全屏与"Esc 归 demo"在规范上互斥**。本轮据此把全屏收敛成站内覆盖层、并停止绑 Esc。
//
// 这个文件把那套约定钉成机器检查：
//   ① 预览全屏栈不得再出现"用 Esc 退全屏"的分支；
//   ② 站点自己的浮层（搜索/筛选抽屉/确认框/公告/Peek）**必须保留** Esc —— 别把收敛做过头；
//   ③ 预览 iframe 不得再有 @dblclick（游戏内双击被外层吃掉，是唯一与焦点无关的必然冲突）；
//   ④ 覆盖层内**必须有可见退出按钮**（站点不绑 Esc 之后，它是唯一可靠出口）；
//   ⑤ 原生全屏整体退役（requestFullscreen / fullscreenchange / fullscreenElement）；
//   ⑥ 独立预览页必须 :hotkeys="false"（那一页一个键都不该绑）。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname, '../src')

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), 'utf8')
}

/** 剥注释：本轮大量注释在解释"为什么不再有 requestFullscreen / escape"，不剥会全是假阳性 */
function readNoComments(rel: string): string {
  return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const PREVIEW = 'components/IframePreview.vue'
const DETAIL = 'views/DemoView.vue'
const PLAY = 'views/DemoPlayView.vue'

describe('预览全屏与键盘归属', () => {
  it('全屏栈里不得再用 Esc 退全屏（预览部分）', () => {
    for (const f of [PREVIEW, DETAIL]) {
      const src = readNoComments(f)
      expect(src, `${f} 里出现了 escape 分支 —— Esc 必须留给作品本身`).not.toMatch(/escape/i)
    }
  })

  it('原生全屏整体退役（不再有 requestFullscreen / fullscreenchange / fullscreenElement）', () => {
    for (const f of [PREVIEW, DETAIL]) {
      const src = readNoComments(f)
      expect(src, `${f} 又调用了原生全屏`).not.toMatch(/requestFullscreen/)
      expect(src, `${f} 又监听了 fullscreenchange`).not.toMatch(/fullscreenchange/)
      expect(src, `${f} 又读了 fullscreenElement`).not.toMatch(/fullscreenElement/)
    }
  })

  it('预览 iframe 不得再有 @dblclick（游戏内双击不被外层吃掉）', () => {
    expect(readNoComments(PREVIEW)).not.toMatch(/@dblclick/)
  })

  it('覆盖层内必须有可见退出按钮（站点不绑 Esc 后的唯一可靠出口）', () => {
    const src = read(PREVIEW)
    expect(src).toContain('preview-fs-exit')
    // 按钮必须真的绑了退出动作，而不是只挂了个类名
    expect(src).toMatch(/class="preview-fs-exit"[\s\S]{0,200}@click="exitFullscreen"/)
  })

  it('站点自己的浮层必须保留 Esc（只收敛全屏那条，别做过头）', () => {
    const mustKeep = [
      'components/SearchOverlay.vue',
      'composables/useFacetDrawer.ts',
      'components/ConfirmHost.vue',
      'components/AnnouncementModal.vue',
      'components/PeekDrawer.vue',
    ]
    for (const f of mustKeep) {
      expect(readNoComments(f), `${f} 丢了 Esc 关闭 —— 那是真·站点浮层`).toMatch(/escape/i)
    }
  })

  it('独立预览页必须把热键关掉（一个键都不绑）', () => {
    expect(readNoComments(PLAY)).toMatch(/:hotkeys="false"/)
  })

  it('hotkeys 默认值必须走 withDefaults（Vue 布尔 prop 缺省会被强转成 false）', () => {
    const src = readNoComments(PREVIEW)
    // 裸 `defineProps<{... hotkeys?: boolean ...}>()` 会让"调用方没传"变成 false，
    // 详情页的 G 热键就静默失效（本轮实测踩到：window 收到了 'g'，处理器从未挂上）。
    expect(src).toMatch(/withDefaults\(\s*defineProps/)
    expect(src).toMatch(/hotkeys:\s*true/)
  })

  it('预览热键只剩 G（F 随原生全屏一起退役）', () => {
    const src = readNoComments(PREVIEW)
    expect(src).toMatch(/toLowerCase\(\)\s*===\s*'g'/)
    expect(src, "F 分支应随原生全屏一起删掉").not.toMatch(/===\s*'f'/)
  })
})
