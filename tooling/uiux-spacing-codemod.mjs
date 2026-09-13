// 字号/间距收编 codemod（等值替换：只把"档内 px 字面值"换成令牌，**不改任何值**）
//
// 用法：
//   node tooling/uiux-spacing-codemod.mjs            # dry-run：只出清单，不落盘
//   node tooling/uiux-spacing-codemod.mjs --apply    # 落盘
//   node tooling/uiux-spacing-codemod.mjs --baseline # 顺带生成档外值白名单（供门禁 ⑧）
//
// 为什么等值替换：`--sp-*`/`--fs-*` 都是固定 px、无 @720 重绑（tokens/primitives.css），
// 所以替换前后**必须像素完全相同** —— 这是这类重构唯一诚实的验收口径。
//
// 刻意不动：档外值（保留字面 + 进白名单）、负值（是偏移量不是间距）、0/auto/%/em/rem/calc()、
// `astra/**`（独立样式岛，只有自己的 --ax-*，塞主站令牌进去会字面失效）、`tokens/**`（定义层）。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'frontend/src'
const APPLY = process.argv.includes('--apply')
const BASELINE = process.argv.includes('--baseline')

const FS_SCALE = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 26, 32]
const SP_SCALE = [2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48]
const SP_PROPS = /^(padding|margin|gap|row-gap|column-gap)(-[a-z]+)?$/
const SKIP_DIRS = [/[\\/]astra[\\/]/, /[\\/]styles[\\/]tokens[\\/]/]

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (/\.(css|vue)$/.test(e.name) && !SKIP_DIRS.some((re) => re.test(p))) yield p
  }
}

/** 把一个属性值里的 px 段换成令牌；返回 { value, hits, offScale } */
function rewriteValue(value, scale, prefix) {
  const hits = []
  const offScale = []
  const out = value
    .split(/(\s+)/) // 保留空白
    .map((tok) => {
      const m = /^(-?)(\d+(?:\.\d+)?)px$/.exec(tok)
      if (!m) return tok
      const [, sign, num] = m
      const n = Number(num)
      if (sign === '-') { offScale.push('-' + n + 'px'); return tok } // 负值=偏移，不进档
      if (!scale.includes(n)) { offScale.push(n + 'px'); return tok }
      hits.push(n)
      return `var(${prefix}${n})`
    })
    .join('')
  return { value: out, hits, offScale }
}

const changes = []
const offScaleTally = new Map()
let fileCount = 0
for (const f of [...walk(ROOT)]) {
  const rel = f.replace(/\\/g, '/')
  const src = fs.readFileSync(f, 'utf8')
  let out = src
  const fileChanges = []

  // ① font-size: Npx → var(--fs-N)
  out = out.replace(/(font-size\s*:\s*)(-?\d+(?:\.\d+)?)px(?=\s*[;}"'!])/g, (all, head, num) => {
    const n = Number(num)
    if (!FS_SCALE.includes(n)) { offScaleTally.set(n + 'px', (offScaleTally.get(n + 'px') || 0) + 1); return all }
    fileChanges.push(`font-size ${n}px → var(--fs-${n})`)
    return `${head}var(--fs-${n})`
  })

  // ② 标题令牌：整值等于既有 clamp 的写法 → 直接引令牌
  out = out.replace(/(font-size\s*:\s*)clamp\(28px,\s*4vw,\s*42px\)/g, (all, head) => {
    fileChanges.push('font-size clamp(28px,4vw,42px) → var(--fs-title-compact)')
    return `${head}var(--fs-title-compact)`
  })

  // ③ 间距属性：逐段替换
  out = out.replace(/(^|[;{\s"'])([a-z-]+)(\s*:\s*)([^;{}"']+)(?=[;}"'])/g, (all, pre, prop, colon, value) => {
    if (!SP_PROPS.test(prop)) return all
    if (/\(/.test(value)) return all // 含函数（clamp/calc/var…）的复杂值整体不动：与门禁⑧同一口径
    const r = rewriteValue(value, SP_SCALE, '--sp-')
    for (const o of r.offScale) offScaleTally.set(o, (offScaleTally.get(o) || 0) + 1)
    if (!r.hits.length) return all
    fileChanges.push(`${prop}: ${value.trim()} → ${r.value.trim()}`)
    return `${pre}${prop}${colon}${r.value}`
  })

  if (fileChanges.length) {
    fileCount++
    changes.push({ file: rel, n: fileChanges.length, sample: fileChanges.slice(0, 3) })
    if (APPLY) fs.writeFileSync(f, out)
  }
}

const total = changes.reduce((a, c) => a + c.n, 0)
console.log((APPLY ? '【已落盘】' : '【dry-run】') + ` 文件 ${fileCount} 个 / 替换 ${total} 处`)
for (const c of changes.sort((a, b) => b.n - a.n).slice(0, 12)) {
  console.log('  ' + c.file.replace('frontend/src/', '').padEnd(46) + c.n + ' 处   e.g. ' + c.sample[0])
}
console.log('\n档外值（保留字面，进白名单）Top 12：')
for (const [k, v] of [...offScaleTally].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log('  ' + k.padEnd(8) + v + ' 次')

if (BASELINE) {
  // 独立全量扫描（与 frontend/tests/designSystem.test.ts 的门禁⑧同一套语义）：
  // 含函数的复杂值整体跳过；引号也算声明终止符（模板内联 style）。
  const off = new Map()
  for (const f of [...walk(ROOT)]) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const tally = (raw, n, scale) => { if (!scale.includes(n)) off.set(raw, (off.get(raw) || 0) + 1) }
    for (const m of src.matchAll(/font-size\s*:\s*(-?\d+(?:\.\d+)?)px/g)) tally(m[1] + 'px', Number(m[1]), FS_SCALE)
    for (const m of src.matchAll(/(?:^|[;{\s"'])([a-z-]+)\s*:\s*([^;{}"']+)/g)) {
      if (!SP_PROPS.test(m[1]) || /\(/.test(m[2])) continue
      for (const tok of m[2].trim().split(/\s+/)) {
        const px = /^(-?\d+(?:\.\d+)?)px$/.exec(tok)
        if (px) tally(tok, Number(px[1]), SP_SCALE)
      }
    }
  }
  const baselinePath = 'frontend/tests/fixtures/spacing-literal-baseline.json'
  const prev = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null
  const data = {
    note: '自动生成（tooling/uiux-spacing-codemod.mjs --baseline）：字号/间距里**允许保留的档外字面值**（全量扫描，与门禁⑧同口径）。新增魔法数字会被门禁拦住；清完请重跑本脚本收窄。',
    scale: { fs: FS_SCALE, sp: SP_SCALE },
    offScale: Object.fromEntries([...off].sort((a, b) => b[1] - a[1])),
  }
  fs.mkdirSync('frontend/tests/fixtures', { recursive: true })
  fs.writeFileSync(baselinePath, JSON.stringify(data, null, 1) + '\n')
  const grew = prev ? Object.keys(data.offScale).filter((k) => !(k in prev.offScale)) : []
  console.log('基线已写：' + baselinePath + '（档外值 ' + Object.keys(data.offScale).length + ' 种）' + (grew.length ? ' ⚠ 新增：' + grew.join(' ') : ''))
}
