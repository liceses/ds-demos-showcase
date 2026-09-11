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

/** 剥注释：本轮大量注释在解释"为什么不再有 requestFullscreen / escape / preview-hint"，不剥会全是假阳性 */
function readNoComments(rel: string): string {
  return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** CSS：剥掉 /* *\/ 注释（GS 里解释历史类名的注释不该被当成"类还在"） */
function readCssNoComments(rel: string): string {
  return read(rel).replace(/\/\*[\s\S]*?\*\//g, '')
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

  it('覆盖层内必须有常驻的退出控件（站点不绑 Esc 后的唯一可靠出口）', () => {
    const src = read(PREVIEW)
    expect(src).toContain('preview-chrome')
    // 必须真的绑了退出动作，而不是只挂了个类名
    expect(src).toMatch(/class="preview-chrome"[\s\S]{0,400}@click="exitFullscreen"/)
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

  it('全屏必须解除内嵌上下文的高度上限（曾导致画面底部空 120px）', () => {
    // styles/pages/demo-detail.css 有一条为"内嵌预览"写的 .dv-stage iframe { max-height: calc(100vh - 120px) }，
    // 1440x900 下 = 780px —— 全屏时它让画面铺不满（实测 frame 780 而非 900）。
    const css = readCssNoComments('styles/components/responsive-v1.css')
    const start = css.indexOf('.preview-shell.web-fullscreen .preview-frame {')
    const body = css.slice(start, css.indexOf('}', start))
    expect(body, '全屏必须显式 max-height: none').toMatch(/max-height:\s*none/)
    expect(body).toMatch(/min-height:\s*0/)
  })

  it('全屏层必须逃出 sticky 祖先的 stacking context', () => {
    // position: sticky 会创建 stacking context —— 覆盖层即使 z-index:9999 也会被关在
    // .dv-stage 里，与"后出现"的兄弟卡片（position:relative/z-index:auto）同级比较时
    // DOM 顺序在后者赢，卡片画在"全屏层"之上（实测 elementsFromPoint 栈顶是 DIV.card）。
    expect(readCssNoComments('styles/components/preview-embed.css')).toMatch(/\.dv-stage--immersive\s*\{[^}]*z-index:\s*var\(--z-fullscreen\)/)
    expect(readNoComments(DETAIL), 'DemoView 必须把逃逸类绑到 stage 上').toMatch(/'dv-stage--immersive':\s*fsActive/)
  })

  it('chrome 不得依赖 JS 维护的悬停状态（会泄漏成"永远展开"）', () => {
    const src = readNoComments(PREVIEW)
    expect(src).not.toMatch(/holdChrome|releaseChrome/)
    // 悬停保持展开交给 CSS
    expect(readCssNoComments('styles/components/preview-embed.css')).toMatch(/\.preview-chrome:hover\s+\.preview-chrome-label/)
  })

  it('独立页顶条必须在文档流内（不得绝对/固定定位压在画面上）', () => {
    const css = read(PLAY)
    const bar = css.slice(css.indexOf('.play-bar {'))
    const body = bar.slice(0, bar.indexOf('}'))
    expect(body, '压回 fixed/absolute 就会重新遮挡画面').not.toMatch(/position:\s*(fixed|absolute)/)
    expect(body).not.toMatch(/\binset\s*:/)
  })

  it('全屏必须真铺满：shell 无 padding、预览 iframe 无描边', () => {
    const css = readCssNoComments('styles/components/responsive-v1.css')
    const shellStart = css.indexOf('.preview-shell.web-fullscreen {')
    const shellBody = css.slice(shellStart, css.indexOf('}', shellStart))
    expect(shellBody).toMatch(/padding:\s*0/)
    const frameStart = css.indexOf('.preview-shell.web-fullscreen .preview-frame {')
    const frameBody = css.slice(frameStart, css.indexOf('}', frameStart))
    expect(frameBody, '全屏时画面上不该留站点的描边').toMatch(/border:\s*none/)
  })

  it('chrome 锚点必须常驻（不可 display:none —— 否则退出不可达）', () => {
    const css = readCssNoComments('styles/components/preview-embed.css')
    const start = css.indexOf('.preview-chrome {')
    const body = css.slice(start, css.indexOf('}', start))
    expect(body).not.toMatch(/display:\s*none/)
    // 收起态只是半透明，不是消失
    expect(body).toMatch(/opacity:\s*0?\.?\d/)
  })

  it('焦点提示必须自动消失（不能只靠"用户点了画面"）+ z 不得低于 chrome', () => {
    const src = read(PREVIEW)
    expect(src, '缺少自动消失定时器').toMatch(/setTimeout\(dismissHint/)
    const css = readCssNoComments('styles/components/preview-embed.css')
    const start = css.indexOf('.preview-kb-toast {')
    const body = css.slice(start, css.indexOf('}', start))
    // 提示用 --z-overlay(2) 时低于 chrome 的 --z-local(10)，会被按钮压住（用户实测）
    expect(body).toMatch(/z-index:\s*var\(--z-toast\)/)
  })

  it('重复且与退出按钮重叠的 .preview-hint 必须已删除', () => {
    // 只看 class 绑定，不看注释（该元素已删，但注释里会提到它的历史）
    expect(read(PREVIEW)).not.toMatch(/class="[^"]*preview-hint/)
    expect(readCssNoComments('styles/components/responsive-v1.css')).not.toContain('.preview-hint')
    expect(readCssNoComments('styles/components/preview-embed.css')).not.toContain('.preview-hint')
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
