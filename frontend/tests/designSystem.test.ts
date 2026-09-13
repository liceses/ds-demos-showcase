// 设计系统护栏：把「UI/UX 规范」焊在代码上（docs/uiux/09-规范↔门禁对照.md 逐条对应）
//
// 为什么需要它（全部是实测出来的存量问题，不是假想）：
//   · 微动效曾散成 29 处手写抬升、20 个文件、6 种影值；
//   · 出过 6 组「同名选择器跨文件互相覆盖」——谁生效只看 index.css 的导入行号
//     （最狠的一组：forum-lite.css 的裸 `.btn:hover/.btn:active` 把**全站**按钮的影档从 8px 改成 3px；
//      另一组更隐蔽：`.forum-topic-card:hover` 的**影在一个文件、transform 在另一个文件**）；
//   · 出过 4 处「hover 影缩」（静止 8px → hover 6px），违反 R6 与参考站 Rule 04；
//   · 触屏防粘滞 `@media (hover:hover)` 只有 .btn 有，其余 28 处在触屏上会粘住；
//   · `.card-entity` 与 `.task-line` 的影值各写各的（分叉风险）；
//   · `--fs-*`/`--sp-*` 两张表建了却几乎没人用（全前端 1 处引用）→ 组件全在写 px 字面值。
//
// 铁律：库外不许新增交互物理 / 跨文件不许同名 / 组件与题目行共用同一对令牌 / 字号间距走令牌。
// 迁移基线（只收窄不扩张）：fixtures/physics-baseline.json、fixtures/spacing-literal-baseline.json
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const STYLES = 'src/styles'
const LIB_FILE = 'components/lift.css'
const baseline = JSON.parse(readFileSync('tests/fixtures/physics-baseline.json', 'utf8'))
const baselineSpacing = JSON.parse(readFileSync('tests/fixtures/spacing-literal-baseline.json', 'utf8'))

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.name.endsWith('.css')) yield p
  }
}

type Rule = { file: string; context: string; sel: string; body: string }

/** 极简 CSS 规则解析：带上下文栈（@media 嵌套），够用且不引依赖 */
function rulesOf(file: string, css: string): Rule[] {
  const out: Rule[] = []
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const stack: string[] = []
  let buf = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '{') {
      const prelude = buf.trim().replace(/\s+/g, ' ')
      buf = ''
      if (prelude.startsWith('@')) stack.push(prelude)
      else {
        let depth = 1
        let j = i + 1
        while (j < src.length && depth > 0) {
          if (src[j] === '{') depth++
          else if (src[j] === '}') depth--
          j++
        }
        out.push({ file, context: stack.join(' && '), sel: prelude, body: src.slice(i + 1, j - 1) })
        i = j - 1
      }
    } else if (c === '}') {
      stack.pop()
      buf = ''
    } else buf += c
    i++
  }
  return out
}

/** 上下文归一键：hover 特性查询不改变"同一条规则"的身份；reduced-motion 是独立的无障碍分支 */
function normCtx(ctx: string): string {
  if (!ctx) return ''
  if (/prefers-reduced-motion/.test(ctx)) return '@reduce'
  if (/hover\s*:\s*hover/.test(ctx)) return ''
  return ctx
}

const keyOf = (r: Rule) => (normCtx(r.context) ? normCtx(r.context) + ' ' : '') + r.sel

const allRules: Rule[] = []
for (const f of walk(STYLES)) {
  const rel = f.replace(/\\/g, '/').replace('src/styles/', '')
  allRules.push(...rulesOf(rel, readFileSync(f, 'utf8')))
}

/** 交互物理 = hover/active 规则里出现 transform 或 box-shadow */
const isPhysics = (r: Rule) => /:(hover|active)\b/.test(r.sel) && /(^|[;{\s])(transform|box-shadow)\s*:/.test(r.body)
const physics = allRules.filter(isPhysics)

describe('① 跨文件同名交互选择器：只许一处（谁生效不许由导入顺序决定）', () => {
  const byKey = new Map<string, Set<string>>()
  for (const r of physics) {
    const k = keyOf(r)
    if (!byKey.has(k)) byKey.set(k, new Set())
    byKey.get(k)!.add(r.file)
  }
  const offenders = [...byKey].filter(([, files]) => files.size > 1).map(([k]) => k)
  const allowed = new Set(baseline.crossFileDuplicates.map((d: { key: string }) => d.key))

  it('新增的跨文件同名必须直接修掉（不许进白名单）', () => {
    const fresh = offenders.filter((k) => !allowed.has(k))
    expect(fresh, '这些交互选择器在多个文件里各定义了一次：' + fresh.join(' / ')).toEqual([])
  })

  it('白名单只收窄不扩张（清单在 fixtures/physics-baseline.json）', () => {
    expect(Array.isArray([...allowed])).toBe(true)
  })
})

describe('② 微交互禁裸写：物理只许在 components/lift.css 里', () => {
  const outside = physics.filter((r) => r.file !== LIB_FILE)

  it('库外的交互物理必须都在基线清单里（基线=迁移清单，只收窄不扩张）', () => {
    const unexpected = outside.filter((r) => {
      const allowed: string[] = baseline.files[r.file] || []
      return !allowed.includes(keyOf(r))
    })
    const desc = unexpected.map((r) => r.file + ' → ' + r.sel)
    expect(desc, '新写的交互物理请改用 .b-lift + --lift-* 变量：\n' + desc.join('\n')).toEqual([])
  })

  it('库里必须真的有那三条物理（hover / active / touch+reduce 守卫），且 .btn 是登记钩子', () => {
    const lib = readFileSync(`${STYLES}/${LIB_FILE}`, 'utf8')
    expect(lib).toMatch(/:is\(\.b-lift, \.btn\)\s*\{/)
    expect(lib).toMatch(/:is\(\.b-lift, \.btn\):hover/)
    expect(lib).toMatch(/:is\(\.b-lift, \.btn\):active/)
    expect(lib).toMatch(/@media \(hover: hover\)/)
    expect(lib).toMatch(/prefers-reduced-motion/)
    expect(lib).toMatch(/box-shadow: var\(--lift-sh-hover, var\(--lift-sh\)\)/)
  })
})

describe('③ 组件与题目行必须共用同一对影令牌（防再次分叉）', () => {
  const card = readFileSync(`${STYLES}/components/card.css`, 'utf8')
  const tasks = readFileSync(`${STYLES}/pages/models-tasks.css`, 'utf8')
  const semantic = readFileSync(`${STYLES}/tokens/semantic.css`, 'utf8')

  it('.card-entity 与 .task-line 绑定同一对 --lift-sh / --lift-sh-hover', () => {
    for (const src of [card, tasks]) {
      expect(src).toMatch(/--lift-sh:\s*var\(--shadow-entity\)/)
      expect(src).toMatch(/--lift-sh-hover:\s*var\(--shadow-entity-hover\)/)
    }
  })

  it('实体影必须是墨色（不许回到彩色），墨黑主题不再单独覆盖，死令牌不许复活', () => {
    expect(semantic).toMatch(/--shadow-entity:\s*var\(--sh-off-uw\) 0px 0px var\(--ink\)/)
    expect(semantic).toMatch(/--shadow-entity-hover:\s*var\(--sh-off-hov-uw\) 0px 0px var\(--ink\)/)
    const themes = readFileSync(`${STYLES}/tokens/themes.css`, 'utf8')
    expect(themes.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/--shadow-entity:/)
    expect(readFileSync(`${STYLES}/tokens/primitives.css`, 'utf8')).not.toMatch(/--k-cyan-dim:/)
  })

  it('hover 档令牌 = 静止档 ×1.5（参考站卡片 8→12、题目行 3→5 同一条律）', () => {
    const prim = readFileSync(`${STYLES}/tokens/primitives.css`, 'utf8')
    expect(prim).toMatch(/--sh-off-hov-uw:\s*5px 5px/)
    expect(prim).toMatch(/--sh-off-hov-sm:\s*3px 3px/)
    expect(prim).toMatch(/--sh-off-hov-md:\s*6px 6px/)
    expect(prim).toMatch(/--sh-off-hov-lg:\s*9px 9px/)
    expect(prim).toMatch(/--sh-off-hov-xl:\s*var\(--sh-off-2xl\)/)
    expect(prim).toMatch(/--sh-off-2xl:\s*12px 12px/)
  })
})

describe('④ 迁移组件的模板使用点必须带 b-lift（类漏了=悬停物理静默失效）', () => {
  const MIGRATED: { file: string; cls: string }[] = [
    { file: 'src/views/ExploreView.vue', cls: 'explore-cell card card-entity' },
    { file: 'src/views/ExploreView.vue', cls: 'task-line' },
    { file: 'src/views/ModelsView.vue', cls: 'model-row card card-entity' },
    { file: 'src/views/TasksView.vue', cls: 'task-row card card-entity' },
    { file: 'src/views/TaskDetailView.vue', cls: 'compare-row card card-entity' },
    { file: 'src/views/ModelDetailView.vue', cls: 'task-line' },
    { file: 'src/views/DemoView.vue', cls: 'task-line' },
    { file: 'src/components/DemoCard.vue', cls: 'card card-hover' },
    { file: 'src/components/ModelChips.vue', cls: 'model-chip' },
    { file: 'src/views/ForumListView.vue', cls: 'forum-topic-card' },
    { file: 'src/views/NotificationsView.vue', cls: 'notif-item' },
    { file: 'src/components/PeekDrawer.vue', cls: 'peek-close' },
    { file: 'src/components/upload/StepDescribe.vue', cls: 'pack-chip' },
  ]

  it('每个使用点的 class 里都能看到 b-lift', () => {
    for (const { file, cls } of MIGRATED) {
      const src = readFileSync(file, 'utf8')
      const hit = src.split('\n').filter((l) => l.includes(cls))
      expect(hit.length, `${file} 里找不到 ${cls}`).toBeGreaterThan(0)
      const withLift = hit.filter((l) => l.includes('b-lift'))
      expect(withLift.length, `${file} 的 ${cls} 使用点缺少 b-lift 类（悬停物理会静默失效）`).toBeGreaterThan(0)
    }
  })

  it('库里声明的每个 --lift-* 变量都被组件用到（僵尸变量=文档漂移的温床）', () => {
    const lib = readFileSync(`${STYLES}/${LIB_FILE}`, 'utf8')
    const vars = [...lib.matchAll(/var\((--lift-[a-z-]+)/g)].map((m) => m[1])
    const consumers = ['components/card.css', 'components/button.css', 'pages/models-tasks.css']
      .map((f) => readFileSync(`${STYLES}/${f}`, 'utf8'))
      .join('\n')
    for (const v of new Set(vars)) {
      expect(consumers.includes(v), `${v} 没有任何组件在用`).toBe(true)
    }
  })
})

describe('⑤ 令牌表与 tokens/*.css 同步（规范里的表是生成物，不许手写漂移）', () => {
  const TOKENS_DIR = 'src/styles/tokens'
  const HASH_FILE = '../docs/uiux/.generated.hash'
  const MD_FILE = '../docs/uiux/03-令牌表.generated.md'

  const sources = () => {
    const files = readdirSync(TOKENS_DIR).filter((f) => f.endsWith('.css')).sort()
    return files.map((f) => ({ f, text: readFileSync(`${TOKENS_DIR}/${f}`, 'utf8') }))
  }

  it('hash 对账：改了 tokens/*.css 必须重跑 tooling/uiux-tokens.mjs', () => {
    const h = createHash('sha256')
    // 归一 EOL：工作区 CRLF（Windows）与 CI 检出 LF 必须算出同一个 hash（真实事故：a295a68 CI 红）
    for (const { f, text } of sources()) h.update(f + '\n' + text.replace(/\r\n/g, '\n'))
    expect(readFileSync(HASH_FILE, 'utf8').trim(), '令牌文件已改但令牌表没重跑：node tooling/uiux-tokens.mjs').toBe(h.digest('hex'))
  })

  it('每个令牌都要出现在生成表里（没有"只在代码里存在"的令牌）', () => {
    const md = readFileSync(MD_FILE, 'utf8')
    const declared = new Set<string>()
    for (const { text } of sources()) {
      for (const m of text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:/gi)) declared.add(m[1])
    }
    const missing = [...declared].filter((n) => !md.includes('`' + n + '`'))
    expect(missing, '这些令牌没进令牌表：' + missing.join(' · ')).toEqual([])
    expect(declared.size, '令牌解析结果异常偏少').toBeGreaterThan(100)
  })

  it('规范区文件齐备（README 的目录表不许指向不存在的文件）', () => {
    const readme = readFileSync('../docs/uiux/README.md', 'utf8')
    const listed = [...readme.matchAll(/`(\d\d-[^`]+\.md|README\.md|log\/)`/g)].map((m) => m[1])
    for (const f of listed) {
      if (f.endsWith('/')) continue
      expect(() => readFileSync('../docs/uiux/' + f, 'utf8'), `${f} 在目录里但不存在`).not.toThrow()
    }
    expect(listed.length).toBeGreaterThan(6)
  })
})

describe('⑥ 硬影格式 / 禁渐变 / 色切 0ms（宪章 P3/P5、参考站 Rule 02/03）', () => {
  const CSS_ONLY = [...walk(STYLES)].map((f) => ({
    file: f.replace(/\\/g, '/').replace('src/styles/', ''),
    text: readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
  }))
  /** 顶层逗号切分（括号内的逗号不算 —— cubic-bezier(0, 0, 0.2, 1) 是常态） */
  const splitTop = (v: string) => {
    const out: string[] = []
    let depth = 0
    let cur = ''
    for (const ch of v) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    if (cur.trim()) out.push(cur)
    return out
  }

  it('硬影格式：box-shadow 的第三段（blur）必须是 0 —— 禁模糊影', () => {
    const bad: string[] = []
    for (const { file, text } of CSS_ONLY) {
      for (const m of text.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) {
        const v = m[1].trim()
        if (/^inset/.test(v) || v === 'none') continue
        const nums = [...v.matchAll(/(-?[\d.]+)px/g)].map((x) => parseFloat(x[1]))
        if (nums.length >= 3 && nums[2] !== 0) bad.push(file + ' → ' + v.slice(0, 60))
      }
    }
    expect(bad, '硬影的 blur 段必须是 0：\n' + bad.join('\n')).toEqual([])
  })

  it('禁渐变：只允许 repeating-linear-gradient（硬边条纹/蚂蚁线是唯一豁免）', () => {
    const bad: string[] = []
    for (const { file, text } of CSS_ONLY) {
      for (const m of text.matchAll(/(?<!repeating-)(linear|radial|conic)-gradient\s*\(/g)) {
        bad.push(file + ' → ' + m[1] + '-gradient')
      }
    }
    expect([...new Set(bad)], '渐变违反"硬边野兽派"（唯一豁免是 .b-march 的硬边条纹）').toEqual([])
  })

  it('色切 0ms：transition 里不许出现颜色属性（除非显式 0ms），也不许 all', () => {
    const COLORISH = /(^|-)color$|^background$|^fill$|^stroke$|^border$|^outline$/
    const bad: string[] = []
    for (const { file, text } of CSS_ONLY) {
      for (const m of text.matchAll(/transition(?:-property)?\s*:\s*([^;}]+)/g)) {
        for (const part of splitTop(m[1])) {
          const tokens = part.trim().split(/\s+/)
          const prop = tokens[0]
          if (!prop) continue
          if (prop === 'all') bad.push(file + ' → transition: all')
          else if (COLORISH.test(prop) && !tokens.some((t) => /^0m?s$/.test(t))) {
            bad.push(file + ' → ' + prop + '（须为 0ms 或移出过渡）')
          }
        }
      }
    }
    // astra 橱窗是独立 mini-SPA，设计系统明确不覆盖（04 §边界）
    const offenders = [...new Set(bad)].filter((b) => !b.startsWith('astra/'))
    expect(offenders, 'R7：颜色一律 0ms 硬切：\n' + offenders.join('\n')).toEqual([])
  })
})

describe('⑦ WCAG 对比度矩阵（每主题一份，进 CI）', () => {
  const prim = readFileSync(`${STYLES}/tokens/primitives.css`, 'utf8')
  const themes = readFileSync(`${STYLES}/tokens/themes.css`, 'utf8')

  const hexOf = (name: string) => {
    const m = new RegExp(name + ':\\s*(#[0-9a-fA-F]{3,8})').exec(prim)
    return m ? m[1] : null
  }
  const lum = (hex: string) => {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a: string, b: string) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
  }

  it('两主题：正文 / 次级 / 错误色 均 ≥ 4.5:1', () => {
    const pairs: [string, string, string][] = [
      ['纸白正文', hexOf('--p-ink')!, hexOf('--p-paper')!],
      ['纸白次级', hexOf('--p-ink-soft')!, hexOf('--p-paper')!],
      ['纸白错误', hexOf('--p-err')!, hexOf('--p-paper')!],
      ['墨黑正文', hexOf('--k-warm-white')!, hexOf('--k-ink')!],
      ['墨黑次级', hexOf('--k-ink-soft')!, hexOf('--k-ink')!],
      ['墨黑错误', hexOf('--k-err')!, hexOf('--k-ink')!],
    ]
    for (const [label, fg, bg] of pairs) {
      const r = ratio(fg, bg)
      expect(r, `${label} ${fg} on ${bg} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('墨黑主题的换绑不许写死 hex（必须绑 --k-* 原子）', () => {
    const inkBlock = themes.slice(themes.indexOf("[data-theme='ink']"), themes.indexOf('color-scheme: dark'))
    for (const line of inkBlock.split('\n')) {
      if (/^\s*--(red|teal|yellow|mint|coral|err|wash-)/.test(line)) {
        expect(/(var\(--k-|var\(--p-)/.test(line), '墨黑换绑必须走原子：' + line.trim()).toBe(true)
      }
    }
  })
})

describe('⑧ 字号/间距必须走令牌（E-5 收编后的守护）', () => {
  // 与 tooling/uiux-spacing-codemod.mjs 同一套语义；豁免 astra（独立样式岛，只有 --ax-*）与 tokens（定义层）
  const FS_SCALE = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 26, 32]
  const SP_SCALE = [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48]
  const SP_PROPS = /^(padding|margin|gap|row-gap|column-gap)(-[a-z]+)?$/
  const skip = (p: string) => /[\\/]astra[\\/]/.test(p) || /[\\/]styles[\\/]tokens[\\/]/.test(p)

  function* walkSrc(dir: string): Generator<string> {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) yield* walkSrc(p)
      else if (/\.(css|vue)$/.test(e.name) && !skip(p)) yield p
    }
  }

  const scan = () => {
    const onScale: string[] = []
    const offScale = new Map<string, number>()
    for (const f of walkSrc('src')) {
      const rel = f.replace(/\\/g, '/')
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      const tally = (raw: string, n: number, scale: number[], token: string) => {
        if (scale.includes(n)) onScale.push(`${rel} → ${raw}（应为 var(${token}${n})）`)
        else offScale.set(raw, (offScale.get(raw) || 0) + 1)
      }
      for (const m of src.matchAll(/font-size\s*:\s*(-?\d+(?:\.\d+)?)px/g)) {
        tally(m[1] + 'px', Number(m[1]), FS_SCALE, '--fs-')
      }
      // 值里必须排除引号：否则会从 style="…" 一路吞到下一个属性，把无关的 px 当成间距值（实测踩到 90px 假阳性）
      for (const m of src.matchAll(/(?:^|[;{\s"'])([a-z-]+)\s*:\s*([^;{}"']+)/g)) {
        if (!SP_PROPS.test(m[1]) || /\(/.test(m[2])) continue // 含函数的复杂值与 codemod 同口径：整体不动
        for (const tok of m[2].trim().split(/\s+/)) {
          const px = /^(-?\d+(?:\.\d+)?)px$/.exec(tok)
          if (px) tally(tok, Number(px[1]), SP_SCALE, '--sp-')
        }
      }
    }
    return { onScale, offScale }
  }

  it('档内字面值必须为 0（收编完成；新写的一律引令牌）', () => {
    const { onScale } = scan()
    expect(onScale.slice(0, 20), `这些地方还写着档内字面值（共 ${onScale.length} 处）：\n` + onScale.slice(0, 20).join('\n')).toEqual([])
  })

  it('档外字面值必须已登记（新增魔法数字 = 测试红）', () => {
    const { offScale } = scan()
    const registered = new Set(Object.keys(baselineSpacing.offScale))
    const fresh = [...offScale.keys()].filter((v) => !registered.has(v))
    expect(fresh, '这些档外值没登记：先决定"补档"还是"保留字面"，再跑 tooling/uiux-spacing-codemod.mjs --baseline：' + fresh.join(' ')).toEqual([])
  })
})

describe('⑨ 按钮 hover 定稿：影保持原档（用户 2026-09-13 拍板）', () => {
  const btn = readFileSync(`${STYLES}/components/button.css`, 'utf8')

  it('变体的 --lift-sh-hover 必须等于 --lift-sh（禁增影）', () => {
    const i = btn.indexOf('.btn-primary,')
    expect(i).toBeGreaterThan(-1)
    const block = btn.slice(i, btn.indexOf('}', i))
    expect(block).toMatch(/--lift-sh:\s*var\(--shadow-lg\)/)
    expect(block).toMatch(/--lift-sh-hover:\s*var\(--lift-sh\)/)
    expect(block).toMatch(/--lift-flat:\s*var\(--sh-off-xl\)/)
  })

  it('无影按钮走 4px 档（参考站"无影按钮从无到有"口径）', () => {
    const i = btn.indexOf('.btn {')
    const block = btn.slice(i, btn.indexOf('}', i))
    expect(block).toMatch(/--lift-sh:\s*none/)
    expect(block).toMatch(/--lift-sh-hover:\s*var\(--sh-off-md\) 0px 0px var\(--ink\)/)
  })

  it('按钮物理不许再写在 button.css / forum-lite.css 里（只许声明变量）', () => {
    for (const f of ['components/button.css', 'pages/forum-lite.css']) {
      const src = readFileSync(`${STYLES}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      const hit = [...src.matchAll(/([^{}]*):hover[^{]*\{([^}]*)\}/g)]
        .filter((m) => /\.btn\b/.test(m[1]))
        .map((m) => m[2])
        .filter((b) => /(transform|box-shadow)\s*:/.test(b))
      expect(hit, `${f} 里还有 hover 物理：\n` + hit.join('\n')).toEqual([])
    }
  })
})
