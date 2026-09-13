// 生成 docs/uiux/03-令牌表.generated.md + .generated.hash
// 规范里的令牌表**不许手写**（本轮已两次抓到"手写数字漂移"）：一律从 tokens/*.css 实读。
// 护栏 frontend/tests/designSystem.test.ts 的 ⑤ 会用同一个 hash 对账 —— 改了令牌不重跑本脚本，
// 门禁就变红。
import fs from 'node:fs'
import path from 'node:path'

const TOKENS_DIR = 'frontend/src/styles/tokens'
const OUT_MD = 'docs/uiux/03-令牌表.generated.md'
const OUT_HASH = 'docs/uiux/.generated.hash'

/** 抽出所有 `--name: value;` 声明（带所在选择器与媒体查询上下文），并统计消费者数 */
function scan() {
  const decls = []
  const files = fs.readdirSync(TOKENS_DIR).filter((f) => f.endsWith('.css')).sort()
  for (const f of files) {
    const src = fs.readFileSync(path.join(TOKENS_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const stack = []
    let sel = ''
    let buf = ''
    let i = 0
    while (i < src.length) {
      const c = src[i]
      if (c === '{') {
        const prelude = buf.trim().replace(/\s+/g, ' ')
        buf = ''
        if (prelude.startsWith('@')) stack.push(prelude)
        else sel = prelude
      } else if (c === '}') {
        if (sel && stack.length === 0) sel = ''
        else if (stack.length && !sel) stack.pop()
        else if (sel) sel = ''
        else stack.pop()
        buf = ''
      } else if (c === ';') {
        const decl = buf.trim()
        buf = ''
        const m = /^(--[a-z0-9-]+)\s*:\s*(.+)$/i.exec(decl)
        if (m) decls.push({ name: m[1], value: m[2].trim(), file: f, sel: sel || ':root', media: stack.join(' && ') })
      } else buf += c
      i++
    }
  }
  return { decls, files }
}

/** 消费者统计：var(--name 在 frontend/src 全域出现的次数。
 *  注意**不能跳过 tokens/ 目录**：色板原子（--p-… 与 --k-…）的消费者常常就是 themes.css / semantic.css
 *  自己 —— 跳过会把它们全判成"无人使用"（假警报，实测踩到）。 */
function consumers(name) {
  let n = 0
  const re = new RegExp('var\\(' + name + '\\b', 'g')
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(css|vue|ts)$/.test(e.name)) {
        const t = fs.readFileSync(p, 'utf8')
        n += (t.match(re) || []).length
      }
    }
  }
  walk('frontend/src')
  return n
}

const { decls, files } = scan()
const uniq = new Map()
for (const d of decls) uniq.set(d.name, d) // 同名以最后一次为准（后定义覆盖前定义）
const rows = [...uniq.values()].sort((a, b) => (a.file === b.file ? a.name.localeCompare(b.name) : a.file.localeCompare(b.file)))

const groups = new Map()
for (const r of rows) {
  const key = r.file + (r.media ? '  @' + r.media : '') + '  [' + r.sel + ']'
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(r)
}

let md = `<!-- 自动生成，勿手改：node tooling/uiux-tokens.mjs（改了 tokens/*.css 必须重跑，否则 designSystem 护栏 ⑤ 变红） -->\n`
md += `# 03 · 令牌表（生成物）\n\n`
md += `来源：\`frontend/src/styles/tokens/*.css\`（${files.join(' · ')}）｜共 **${rows.length}** 个令牌。\n\n`
md += `「消费者」= \`var(--x)\` 在样式与模板里出现的次数（0 = 无人使用，属待清理项，见 07-例外登记.md）。\n\n`
for (const [key, list] of groups) {
  md += `## ${key}\n\n| 令牌 | 值 | 消费者 |\n|---|---|---|\n`
  for (const r of list.sort((a, b) => a.name.localeCompare(b.name))) {
    const n = consumers(r.name)
    md += `| \`${r.name}\` | \`${r.value.replace(/\|/g, '\\|')}\` | ${n === 0 ? '**0（待清理）**' : n} |\n`
  }
  md += '\n'
}
const zero = rows.filter((r) => consumers(r.name) === 0).map((r) => r.name)
md += `## 无人使用的令牌（${zero.length}）\n\n${zero.length ? zero.map((z) => '`' + z + '`').join(' · ') : '（无）'}\n`

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true })
fs.writeFileSync(OUT_MD, md)

// hash 只覆盖"源"（令牌文件内容），不受本脚本排版变化影响
const crypto = await import('node:crypto')
const h = crypto.createHash('sha256')
for (const f of files) h.update(f + '\n' + fs.readFileSync(path.join(TOKENS_DIR, f), 'utf8'))
const hash = h.digest('hex')
fs.writeFileSync(OUT_HASH, hash + '\n')

console.log(`OK ${OUT_MD}（${rows.length} 个令牌，其中无人使用 ${zero.length} 个）`)
console.log(`OK ${OUT_HASH} ${hash.slice(0, 16)}…`)
