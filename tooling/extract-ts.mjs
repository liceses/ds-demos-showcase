#!/usr/bin/env node
/**
 * dsh-project-model extractor (TS/Vue) — 前端骨架提取器。
 *
 * 扫描 frontend/src 下的 .ts/.tsx/.vue，用正则提取 import（含动态 import 与
 * Vue SFC script 块），解析相对路径为节点 id（相对 src、去扩展、去 /index），
 * 输出 JGF fragment（JSON），供 merge.py 与后端 fragment 合并后落盘。
 *
 * 与 extract.py 的输出契约一致：graph 字段结构相同（id 前缀 fe- 区分），
 * 节点 id 无特殊字符（相对路径天然无点号），edge 关系 = dependency，
 * provenance = generated。
 *
 * 用法：
 *   node extract-ts.mjs --src frontend/src --dst /tmp/fe.json
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative, resolve, dirname, extname, basename, sep } from 'node:path'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const SRC = flag('--src')
const DST = flag('--dst')
const DEPTH = flag('--depth') || 'module'
if (!SRC || !DST) {
  console.error('usage: node extract-ts.mjs --src <dir> --dst <out.json> [--depth module|function]')
  process.exit(2)
}

/** 递归收集目录下目标类型文件（ts/tsx/vue + js/mjs——JS 项目同样适用）。 */
function collectFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...collectFiles(p))
    else if (/\.(ts|tsx|vue|js|mjs)$/.test(entry)) out.push(p)
  }
  return out
}

/** import 语句提取：静态 + 动态 + 副作用；去重。 */
function extractImports(text) {
  const specs = new Set()
  const reFrom = /\bfrom\s*['"]([^'"]+)['"]/g
  const reSide = /\bimport\s+['"]([^'"]+)['"]/g
  const reDynamic = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  const reRequire = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g // 兼容性
  for (const re of [reFrom, reSide, reDynamic, reRequire]) {
    let m
    while ((m = re.exec(text))) specs.add(m[1])
  }
  return [...specs]
}

/** 解析相对导入 → src 内无扩展 id；失败返回 null。 */
function resolveImport(spec, fromDir) {
  if (!spec.startsWith('.')) return null // node_modules / alias：v1 只画项目内
  const parts = spec.split('/')
  let depth = 0
  while (parts[0] === '.' || parts[0] === '..') {
    if (parts[0] === '..') depth++
    parts.shift()
  }
  if (depth === 0 && spec.startsWith('./')) {
    // ./x → dir + x（depth 0 处理）——上面 while 已吃掉 '.'
  }
  // 候选：无扩展（可能指向 .ts/.vue/目录）
  let base = []
  let dir = fromDir.split('/')
  for (let i = 0; i < depth; i++) if (dir.length > 0) dir.pop()
  base = dir.concat(parts)
  const candidates = [
    base.join('/'), // 目录 → index
    base.join('/') + '.ts',
    base.join('/') + '.tsx',
    base.join('/') + '.vue',
    base.join('/') + '/index.ts',
    base.join('/') + '/index.vue',
  ]
  for (const c of candidates) {
    if (fileExists(c)) return normalizeId(c)
  }
  return null
}

/** src 内路径 → 相对 src 的无扩展 id（去 /index；剥空则保留 index）。 */
function normalizeId(full) {
  let rel = relative(SRC, full).split(sep).join('/')
  rel = rel.replace(/\.(ts|tsx|vue|js|mjs)$/, '')
  rel = rel.replace(/(^|\/)index$/, '') // views/index.ts → views
  if (!rel) rel = 'index' // lib/index.js → index（不剥成空 id）
  if (rel.endsWith('/')) rel = rel.slice(0, -1)
  return rel
}

const cache = new Map()
function fileExists(full) {
  if (cache.has(full)) return cache.get(full)
  let ok = false
  try { ok = statSync(full).isFile() } catch { ok = false }
  cache.set(full, ok)
  return ok
}

const files = collectFiles(SRC)
const ids = new Map() // full path → id
for (const f of files) ids.set(f, normalizeId(f))
const idSet = new Set(ids.values())

// ── 函数级模式（--depth function）：正则提取函数 + 调用图 ──────────────
// 粗糙但可用：函数级数据不参与门禁，新鲜度由 UI 提示兜底（分层门禁设计）。
if (DEPTH === 'function') {
  const FN_RE = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g
  const ARROW_RE = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|[A-Za-z_$][\w$]*)\s*=>/g
  const nodes = {}
  const callPairs = new Set() // "src|dst"
  const funcNames = new Set()
  const funcOf = new Map() // "moduleId::name" → nodeId
  const fileFuncs = new Map() // moduleId → [{name, sig, line}]

  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const mid = ids.get(f)
    const found = []
    const lines = text.split('\n')
    for (const re of [FN_RE, ARROW_RE]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(text))) {
        const name = m[1]
        const sig = `${name}(${m[2] || ''})`
        const line = text.slice(0, m.index).split('\n').length
        found.push({ name, sig, line })
        funcNames.add(name)
        funcOf.set(`${mid}::${name}`, `${mid}::${name}`)
      }
    }
    fileFuncs.set(mid, found)
  }

  // 调用图：按函数体（声明行 → 下一声明行）匹配 `name(`，被调名 → 同文件函数
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const mid = ids.get(f)
    const fns = (fileFuncs.get(mid) || []).slice().sort((a, b) => a.line - b.line)
    const lines = text.split('\n')
    for (let i = 0; i < fns.length; i++) {
      const fn = fns[i]
      const srcId = `${mid}::${fn.name}`
      const end = i + 1 < fns.length ? fns[i + 1].line - 1 : lines.length
      const body = lines.slice(fn.line - 1, end).join('\n')
      const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g
      let m
      while ((m = callRe.exec(body))) {
        const callee = m[1]
        if (callee === fn.name) continue // 递归不算
        const target = funcOf.get(`${mid}::${callee}`)
        if (target && target !== srcId) callPairs.add(`${srcId}|${target}`)
      }
    }
  }

  // 跨文件调用：被调函数名在别的文件也定义时，v1 只连同文件（精确性由 UI 新鲜度兜底）
  const calledBy = new Map()
  for (const key of callPairs) {
    const [s, t] = key.split('|')
    if (!calledBy.has(t)) calledBy.set(t, [])
    calledBy.get(t).push(s)
  }
  for (const [mid, fns] of fileFuncs) {
    for (const fn of fns) {
      const nid = `${mid}::${fn.name}`
      const calls = [...callPairs].filter((k) => k.startsWith(nid + '|')).map((k) => k.split('|')[1]).sort()
      nodes[nid] = {
        label: fn.name,
        metadata: {
          kind: 'function',
          parent: mid,
          provenance: 'generated',
          signature: fn.sig,
          line: fn.line,
          file: basename(mid) + '.ts',
          calls,
          called_by: (calledBy.get(nid) || []).sort(),
          variables: [],
        },
      }
    }
  }
  const edges = [...callPairs].sort().map((k) => {
    const [s, t] = k.split('|')
    return { id: `call-${s}->${t}`, source: s, target: t, relation: 'call', metadata: { provenance: 'generated' } }
  })
  const doc = {
    graph: {
      id: 'pim-functions-fe',
      directed: true,
      type: 'pim-functions',
      metadata: {
        schema_contract: 'docs/model/contract.schema.json',
        generated_at: new Date().toISOString(),
      },
      nodes,
      edges,
    },
  }
  mkdirSync(dirname(DST), { recursive: true })
  writeFileSync(DST, JSON.stringify(doc, null, 2), 'utf8')
  console.log(`wrote ${DST} — ${Object.keys(nodes).length} function nodes, ${edges.length} call edges (depth=function)`)
  process.exit(0)
}

// 收集边
const edgeLines = new Map() // "src|dst" → 1
const fileOfId = new Map([...ids].map(([f, id]) => [id, f]))
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  const fromDir = join(dirname(f), '').split(sep).join('/')
  for (const spec of extractImports(text)) {
    const target = resolveImport(spec, fromDir)
    if (target && idSet.has(target)) {
      edgeLines.set(`${ids.get(f)}|${target}`, 1)
    }
  }
}

// 指标：loc + todo_density + fan_in/out
const loc = new Map()
const todos = new Map()
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  loc.set(ids.get(f), text.split('\n').length)
  todos.set(ids.get(f), (text.match(/#\s*(TODO|FIXME|HACK|XXX)\b/gi) || []).length)
}
const fanIn = new Map([...ids.values()].map((id) => [id, 0]))
const fanOut = new Map([...ids.values()].map((id) => [id, 0]))
const edges = []
for (const key of [...edgeLines.keys()].sort()) {
  const [s, t] = key.split('|')
  fanOut.set(s, fanOut.get(s) + 1)
  fanIn.set(t, fanIn.get(t) + 1)
  edges.push({
    id: `dep-${s}->${t}`,
    source: s,
    target: t,
    relation: 'dependency',
    metadata: { provenance: 'generated' },
  })
}

/** 前端"层"= 顶层目录（结构事实，机械分配，非人的判断——provenance 仍 generated）。 */
function layerOf(nid) {
  const top = nid.split('/')[0]
  if (nid.startsWith('views')) return 'views'
  if (nid.startsWith('components')) return 'components'
  if (nid.startsWith('stores')) return 'stores'
  if (nid.startsWith('composables')) return 'composables'
  if (nid.startsWith('api')) return 'api'
  if (nid.startsWith('utils')) return 'utils'
  if (nid.startsWith('router')) return 'router'
  if (nid.startsWith('i18n')) return 'i18n'
  if (nid.startsWith('astra')) return 'astra'
  if (nid === 'main' || nid === 'App') return 'entry'
  return 'misc'
}

// 指标：loc + todo_density + fan_in/out（在 edgeLines 收集后定义，见上）

const nodes = {}
for (const id of [...ids.values()].sort()) {
  const lc = loc.get(id) || 0
  nodes[id] = {
    label: basename(id) || id,
    metadata: {
      layer: layerOf(id),
      provenance: 'generated',
      metrics: {
        loc: lc,
        todo_density: lc ? Math.round(((todos.get(id) || 0) / lc) * 1e4) / 1e4 : 0,
        fan_in: fanIn.get(id),
        fan_out: fanOut.get(id),
      },
    },
  }
}

const doc = {
  graph: {
    id: 'pim-skeleton-fe',
    directed: true,
    type: 'pim-skeleton',
    metadata: { schema_contract: 'docs/model/contract.schema.json' },
    nodes,
    edges,
  },
}

mkdirSync(dirname(DST), { recursive: true })
writeFileSync(DST, JSON.stringify(doc, null, 2), 'utf8')
console.log(`wrote ${DST} — ${Object.keys(nodes).length} nodes, ${edges.length} edges`)
