// P0-2 安全网：布局令牌完整性（fs 扫描 + 纯文本断言，零 DOM）。
//
// 背景：P0-2 之前全站**只有色彩/阴影/边框有令牌**，间距 790 条声明、字号 24 个字面值、
// z-index 20 个离散值全部裸写 —— 「统一调整」在物理上没有抓手，层级胜负靠猜数字。
// P0-2 建了 --sp-*/--fs-*/--w-*/--z-*/--tabbar-* 这套表，并把 23 处全局 z-index 收敛进 --z-*。
//
// 令牌化最危险的失效模式是**拼错名字**：`var(--z-tababr)` 不会报错，只会让
// z-index 变成 auto（层叠静默失效）、间距变 0。所以这个文件把三类问题变成测试失败：
//   1. 引用了未定义的布局令牌；
//   2. 定义了却没人用的 --z-* 层（层表里的僵尸档）；
//   3. 新的裸 z-index 数字绕过层表（唯一豁免是抽屉内部的相对序，见 ALLOWED_LOCAL_Z）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = 'src'
const TOKEN_FILES = ['src/styles/tokens/primitives.css', 'src/styles/tokens/semantic.css']

/** 布局令牌命名空间（色彩/阴影/边框令牌不在此测试范围） */
const NAMESPACES = ['--z-', '--sp-', '--fs-', '--w-', '--tabbar-']

/** 允许保留字面量的局部层叠：作品详情预览内部的纯局部抬升（5）。
 *  它不参与全局层表（父级已建立层叠上下文），改动前需读上下文。
 *  筛选抽屉的 44/45/46 已在 P1 收进 `calc(var(--z-sheet) - N)`（移动端必须压过底栏 900，
 *  不再是"局部"问题）；全屏控件原为字面量 3，P1 起改用 `var(--z-local)`。 */
const ALLOWED_LOCAL_Z = new Set(['5'])

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = dir + '/' + e
    if (statSync(p).isDirectory()) yield* files(p)
    else if (/\.(css|vue)$/.test(e)) yield p
  }
}

function read(p: string): string {
  return readFileSync(p, 'utf8')
}

/** 读源码并剥掉注释：注释里出现的 "bottom: 0"、"--z-xxx" 之类字样是文档，
 *  不该被"禁止字面量"类断言当成违规（踩过：自己的说明注释把测试判红）。 */
function readNoComments(p: string): string {
  return read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function allSources(): string[] {
  return [...files(ROOT)]
}

function definedTokens(): Set<string> {
  const set = new Set<string>()
  for (const f of TOKEN_FILES) {
    for (const m of read(f).matchAll(/(--[a-z0-9-]+)\s*:/gi)) set.add(m[1])
  }
  return set
}

describe('布局令牌', () => {
  it('src 里引用的布局令牌都已定义（拼错名字 = 层叠静默失效）', () => {
    const defined = definedTokens()
    const missing: string[] = []
    for (const f of allSources()) {
      for (const m of read(f).matchAll(/var\((--[a-z0-9-]+)/gi)) {
        const name = m[1]
        if (!NAMESPACES.some((p) => name.startsWith(p))) continue
        if (!defined.has(name)) missing.push(`${name} ← ${f}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('定义过的 --z-* 层都有人用（层表不留僵尸档）', () => {
    const defined = [...definedTokens()].filter((n) => n.startsWith('--z-'))
    expect(defined.length).toBeGreaterThan(10)
    const used = new Set<string>()
    for (const f of allSources()) {
      for (const m of read(f).matchAll(/var\((--z-[a-z0-9-]+)/gi)) used.add(m[1])
    }
    expect(defined.filter((n) => !used.has(n))).toEqual([])
  })

  it('没有绕过层表的裸 z-index 数字（豁免仅抽屉内部相对序）', () => {
    const offenders: string[] = []
    for (const f of allSources()) {
      read(f)
        .split('\n')
        .forEach((line, i) => {
          const m = /z-index:\s*(-?\d+)\s*;/.exec(line)
          if (m && !ALLOWED_LOCAL_Z.has(m[1])) offenders.push(`${f}:${i + 1} z-index: ${m[1]}`)
        })
    }
    expect(offenders).toEqual([])
  })

  it('底栏高度是令牌而非字面量（P1 底栏占位契约的数据源）', () => {
    const app = read('src/components/AppTabBar.vue')
    expect(app).toContain('var(--tabbar-h)')
    expect(read('src/styles/tokens/primitives.css')).toContain('--tabbar-h-safe')
  })

  it('页内贴底浮层不许再抢底栏的位置（P1 底栏契约）', () => {
    // 常驻贴底条：bottom 必须走 --tabbar-h-safe（就位于底栏之上）
    const demo = readNoComments('src/views/DemoView.vue')
    expect(demo).toMatch(/\.dv-mbar\s*\{[^}]*bottom:[^;]*var\(--tabbar-h-safe\)/s)
    expect(demo).not.toMatch(/\.dv-mbar\s*\{[^}]*bottom:\s*0/s)
    // 模态浮层：z-index 必须高于底栏（压过它），而不是被它盖住
    const demos = readNoComments('src/views/DemosView.vue')
    expect(demos).toMatch(/\.facet-panel--sheet\s*\{[^}]*z-index:\s*var\(--z-sheet\)/s)
  })
})
