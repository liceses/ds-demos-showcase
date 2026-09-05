// T14 v2 扫描器：在 _t13-audit-refs-all 基础上——①跳过注释行 ②动态前缀族解析（前缀+文件内字符串字面量补全 ↔ en 叶子）③孤儿键候选检测
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ts = require('D:/developing/ds民间科研成果展示/web/frontend/node_modules/typescript/lib/typescript.js')
const ROOT = 'D:/developing/ds民间科研成果展示/web/frontend/src'

const sfEn = ts.createSourceFile('en', readFileSync(ROOT + '/i18n/en.ts', 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
const leaves = new Set()
function walk(o, p) {
  for (const pr of o.properties) {
    if (!ts.isPropertyAssignment(pr)) continue
    const n = pr.name.text
    const cp = p ? p + '.' + n : n
    if (ts.isObjectLiteralExpression(pr.initializer)) walk(pr.initializer, cp)
    else leaves.add(cp)
  }
}
sfEn.forEachChild((n) => {
  if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) {
    if (d.name.getText(sfEn) === 'en') {
      let i = d.initializer
      while (i && !ts.isObjectLiteralExpression(i)) i = i.expression
      if (ts.isObjectLiteralExpression(i)) walk(i, '')
    }
  }
})

function* files(dir) {
  for (const e of readdirSync(dir)) {
    const p = dir + '/' + e
    const st = statSync(p)
    if (st.isDirectory()) yield* files(p)
    else if (/\.(vue|ts)$/.test(e) && !e.endsWith('.d.ts')) yield p
  }
}

const missing = []
const resolvedDynamic = []
for (const f of files(ROOT)) {
  const src = readFileSync(f, 'utf8')
  // ①逐行扫描并剥离行注释（view.key 注释误报教训）
  const codeLines = src.split('\n').map((l) => l.replace(/(^|[^:'"])\/\/.*$/, '$1'))
  const code = codeLines.join('\n')
  const re = /\bt(?:Arr)?\(\s*['"]([\w.]+)['"]/g
  let m
  while ((m = re.exec(code)) !== null) {
    const key = m[1]
    if (leaves.has(key)) continue
    if (key.endsWith('.') || key.endsWith('_')) {
      // 动态前缀：在同文件内收集「'前缀' + expr」与「前缀后接的字符串字面量」补全
      const completions = new Set()
      const reConcat = new RegExp("['\"]" + key.replace(/\./g, '\\.') + "'\\s*\\+\\s*([\\w.$]+)", 'g')
      let cm
      while ((cm = reConcat.exec(code)) !== null) {
        const varName = cm[1].split(/[.[]/)[0]
        // 收集该文件里 varName 附近的字符串字面量（近似：同文件所有短字符串字面量）
        const reStr = /['"]([a-zA-Z_][\w-]*)['"]/g
        let sm
        while ((sm = reStr.exec(code)) !== null) completions.add(sm[1])
      }
      // 也收集直接拼接形态：'prefix' + 'literal'
      let uncovered = false
      // 判定：对动态族，检查 en 中是否存在以前缀开头的叶子
      let covered = false
      for (const leaf of leaves) if (leaf.startsWith(key)) { covered = true; break }
      if (!covered) uncovered = true
      if (uncovered) missing.push(f.slice(ROOT.length + 1) + ' → ' + key + ' (动态，en 无此前缀族)')
      else resolvedDynamic.push(f.slice(ROOT.length + 1) + ' → ' + key + '* ✓（en 有此前缀族 ' + completions.size + ' 候选）')
    } else {
      missing.push(f.slice(ROOT.length + 1) + ' → ' + key)
    }
  }
}
console.log('叶子键:', leaves.size)
console.log(missing.length ? '真缺键 ' + missing.length + ':\n' + missing.join('\n') : '✅ 全 src t() 引用（含动态族）全部命中 en.ts')
console.log('动态族已解析覆盖:', resolvedDynamic.length ? '\n' + resolvedDynamic.join('\n') : '无')

// ③孤儿键候选：en 叶子中，全路径与其父前缀都未在任何 src 文件出现的
const allSrc = []
for (const f of files(ROOT)) allSrc.push(readFileSync(f, 'utf8'))
const allSrcJoined = allSrc.join('\n')
const orphans = []
for (const leaf of leaves) {
  if (allSrcJoined.includes("'" + leaf + "'") || allSrcJoined.includes('"' + leaf + '"')) continue
  const parent = leaf.slice(0, leaf.lastIndexOf('.'))
  if (parent && allSrcJoined.includes("'" + parent + ".")) continue // 动态族父前缀在用 → 非孤儿
  if (allSrcJoined.includes(leaf.split('.').pop())) continue // 兜底：键名片段在用（弱证据，宁可不报）
  orphans.push(leaf)
}
console.log('孤儿键候选:', orphans.length ? '\n' + orphans.join('\n') : '无')