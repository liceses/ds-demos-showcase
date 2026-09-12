// 探索页改版：纯函数单测 + 源码护栏
//
// 这轮改动的核心是"空实体降权"（5 个模型里 4 个是 0 作品，却与有内容的同等视觉权重）。
// 下面这些断言把三个最容易回退的点钉住：
//   ① 「全空则不折叠」的边界（否则折叠后页面看起来是空的，比原问题更糟）
//   ② eyebrow 不许复述标题（首屏最贵位置重复同层信息）
//   ③ `hidden` 必须显式复位（作者样式 display:grid 会覆盖 UA 的 [hidden]{display:none} —— 实测踩到）
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { partitionByContent } from '../src/utils/partitionByContent'

const SRC = path.resolve(import.meta.dirname, '../src')
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8')

describe('partitionByContent（空实体分区）', () => {
  const items = [{ n: 3 }, { n: 0 }, { n: 1 }, { n: 0 }]
  const of = (x: { n: number }) => x.n

  it('有内容的在前、空的在后，各自保持原顺序', () => {
    const p = partitionByContent(items, of)
    expect(p.withContent.map(of)).toEqual([3, 1])
    expect(p.empty.map(of)).toEqual([0, 0])
  })

  it('有空实体且有内容 → 折叠', () => {
    expect(partitionByContent(items, of).collapsed).toBe(true)
  })

  it('**全部都没有内容 → 不折叠**（边界：折叠后页面看起来是空的，比原问题更糟）', () => {
    const allEmpty = [{ n: 0 }, { n: 0 }]
    const p = partitionByContent(allEmpty, of)
    expect(p.withContent).toEqual([])
    expect(p.empty.length).toBe(2)
    expect(p.collapsed).toBe(false)
  })

  it('全部都有内容 → 不折叠（没有可折叠的东西）', () => {
    expect(partitionByContent([{ n: 2 }, { n: 5 }], of).collapsed).toBe(false)
  })

  it('空数组不炸', () => {
    expect(partitionByContent([], of)).toEqual({ withContent: [], empty: [], collapsed: false })
  })
})

describe('探索页护栏', () => {
  const view = read('views/ExploreView.vue')
  const css = read('styles/pages/explore.css')

  it('必须用 partitionByContent 分区（不得直接渲染全部 items）', () => {
    expect(view).toContain('partitionByContent')
    expect(view).toMatch(/v-for="m in modelsPart\.withContent"/)
    expect(view).not.toMatch(/v-for="m in data\.models\.items"/)
  })

  it('折叠控件必须有 aria-expanded / aria-controls / data-fold 钩子', () => {
    expect(view).toMatch(/data-fold-toggle/)
    expect(view).toMatch(/aria-controls="explore-fold-models"/)
    expect(view).toMatch(/:aria-expanded="modelsOpen"/)
  })

  it('`hidden` 必须有显式复位（作者样式 display:grid 会覆盖 UA 的 [hidden]）', () => {
    expect(css).toMatch(/\.explore-grid\[hidden\]/)
    expect(css).toMatch(/\.task-lines\[hidden\]/)
  })

  it('统计计数不得再用行动色（黄）', () => {
    // 统计改白底黑边只在探索页生效（.mini-stat 是全站共享类）
    const scoped = view.slice(view.indexOf('<style scoped>'))
    // 只检查 **.mini-stat / 题目计数** 这两条规则体内不得出现 --yellow
    // （整块断言过宽：scoped 里别的规则合法用到 --yellow 时会误报）
    for (const sel of [':deep(.mini-stat)', ':deep(.task-line-count)']) {
      const i = scoped.indexOf(sel)
      expect(i, sel + ' 应存在于 scoped 样式').toBeGreaterThan(-1)
      const body = scoped.slice(scoped.indexOf('{', i), scoped.indexOf('}', i))
      expect(body, sel + ' 不该用行动色').not.toContain('--yellow')
    }
    // 数字方块也要复位（.mini-stat b 自带黄底）
    expect(scoped).toMatch(/:deep\(\.mini-stat\) b/)
  })

  it('标签段不得再"一筐套一筐"（每键外框 + 组框已删）', () => {
    // 用户实测反馈：三层黑框装一个 chip，且外层块 672px 宽 —— 空与重同时发生
    // 只看**真实用法**，不看注释（注释里会解释"改前是 TagGroupBox" —— 整串匹配会误报）
    expect(view).not.toMatch(/<TagGroupBox/)
    expect(view).not.toContain("import TagGroupBox")
    expect(view).not.toMatch(/class="explore-label-block"/)
    expect(view).not.toMatch(/class="explore-labels"/)
    expect(css).not.toContain('.explore-label-block')
    // 扁平结构：dl/dt/dd
    expect(view).toMatch(/<dl v-else class="explore-facets"/)
    expect(view).toMatch(/<dt class="explore-facet-key/)
    expect(view).toMatch(/<dd class="explore-facet-values">/)
  })

  it('dd 必须显式清零左边距（dl 默认 margin-inline-start 会顶开键值对齐）', () => {
    const i = css.indexOf('.explore-facet-values')
    const body = css.slice(css.indexOf('{', i), css.indexOf('}', i))
    expect(body).toMatch(/margin:\s*0/)
  })

  it('值的交互能力不回退：仍是链接 + 保留介绍气泡', () => {
    // 用纯字符串包含断言：正则里的 \` / \$ 转义都是多余的（lint no-useless-escape 会报）
    expect(view).toContain('/tag/${k}/${v.value}')
    expect(view).toContain('<TagTip')
    expect(view).toMatch(/class="tag-chip mode-fixed"/)
  })

  it('空键走 muted 文本，不再占独立盒子', () => {
    expect(view).toMatch(/explore\.noValue/)
    expect(view).not.toMatch(/boxCount\(/)
  })

  it('D 变体必须同时有顶带与左带（设计稿有两条，实现不许只留一条）', () => {
    // 这条护栏来自一次真实偏差：设计稿 D = 顶带 + 左带，而实施计划漏写了顶带、实现照计划走 → 稿子与落地不一致
    expect(view).toContain('explore-band--top')
    expect(view).toContain('explore-band--left')
    expect(view).not.toMatch(/class="explore-band"\s/) // 不许再出现"光秃秃一条"的写法
  })

  it('色带偏移必须走 --border-w 令牌（不许硬编码 -4px）', () => {
    const i = css.indexOf('.explore-band--top')
    const body = css.slice(i, css.indexOf('}', css.indexOf('.explore-band--left')))
    expect(body).toMatch(/calc\(var\(--border-w\) \* -1\)/)
    expect(body).not.toMatch(/left:\s*-4px/)
  })

  it('eyebrow 不得等于标题（首屏最贵位置不复述同层信息）', () => {
    const en = read('i18n/en.ts')
    // 注意：en.ts 里第一个 `explore: {` 是 app.nav 的**导航标签对象**（紧凑单行），
    // 页面级那段才是我们要找的 —— 用 modelsTitle 定位，别再踩同一个坑。
    const at = en.indexOf('modelsTitle')
    const block = en.slice(en.lastIndexOf('explore: {', at), en.indexOf('\n  },', at))
    const pick = (k: string) => new RegExp(`\\n\\s+${k}: '([^']*)'`).exec(block)?.[1]
    const eyebrow = pick('eyebrow')
    const title = pick('title')
    expect(eyebrow).toBeTruthy()
    expect(eyebrow).not.toBe(title)
  })
})
