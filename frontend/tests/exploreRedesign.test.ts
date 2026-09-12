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
