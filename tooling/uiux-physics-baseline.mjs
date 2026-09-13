// 生成「微交互物理」基线清单 → frontend/tests/fixtures/physics-baseline.json
// 用途：护栏只拦"新增"（阶段 2 逐步清空基线），不要求一次性迁完 45 处。
// 基线里的每一项都是**存量债**，带 reason；清掉后重跑本脚本即可收窄基线。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'frontend/src/styles'

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.name.endsWith('.css')) yield p
  }
}

function rules(file, css) {
  const out = []
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const stack = []
  let buf = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '{') {
      const prelude = buf.trim()
      buf = ''
      if (prelude.startsWith('@')) stack.push(prelude)
      else {
        let depth = 1, j = i + 1
        while (j < src.length && depth > 0) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++ }
        out.push({ file, context: stack.join(' && '), sel: prelude.replace(/\s+/g, ' '), body: src.slice(i + 1, j - 1) })
        i = j - 1
      }
    } else if (c === '}') { stack.pop(); buf = '' } else buf += c
    i++
  }
  return out
}

const normCtx = (ctx) => {
  if (!ctx) return ''
  if (/prefers-reduced-motion/.test(ctx)) return '@reduce'
  if (/hover\s*:\s*hover/.test(ctx)) return ''
  return ctx
}

const all = []
for (const f of walk(ROOT)) {
  const rel = f.replace(/\\/g, '/').replace('frontend/src/styles/', '')
  all.push(...rules(rel, fs.readFileSync(f, 'utf8')))
}
const physics = all.filter((r) => /:(hover|active)\b/.test(r.sel) && /(^|[;{\s])(transform|box-shadow)\s*:/.test(r.body))

// 每个文件允许保留的存量交互选择器（阶段 2 迁移清单）
const REASONS = {
  'components/button.css': '按钮族：R6 口径已合规（hover 增影+抬起 / active 压平），阶段 2 接线到 .b-lift',
  'components/chip.css': 'tag-chip：阶段 2',
  'components/preview-embed.css': '预览控件按下态：阶段 2',
  'components/tabs.css': 'tab：阶段 2',
  'pages/about.css': '装饰性 hover（标题下划线/评分星）：非抬升物理，阶段 2 复核是否该进库',
  'pages/admin-shell.css': '后台卡：阶段 2',
  'pages/demo-detail.css': '侧栏导轨：阶段 2',
  'pages/demo-next.css': '下一件卡（含背景硬切，Rule 02 正例）：阶段 2 接线',
  'pages/forum-lite.css': '论坛壳（已加 .forum-shell 前缀）：阶段 2',
  'pages/forum.css': '论坛：阶段 2',
  'pages/home.css': '公告卡/提示：阶段 2',
  'pages/interactions.css': '法则 01 active 压平补齐（tag-chip/tab/badge）：阶段 2 收进库',
  'pages/markdown.css': '正文链接卡：阶段 2',
  'pages/peek-drawer.css': '瞄一眼抽屉关闭键按下态：阶段 2',
  'pages/skeleton-extended.css': '通知行：阶段 2',
  'pages/tag-system.css': '标签抽屉条：阶段 2',
  'pages/upload-advpack.css': 'pack-chip：阶段 2',
  'pages/upload-wizard.css': '上传类型卡/步骤（.uw-type:hover 与 @reduce 两条）：阶段 2',
  'tokens/motion.css': '法则 01 的 active 压平清单（.ac-card/.uw-type/.dv-rail/.dv-collapse/.uw-edit）+ .ac-card.hot:hover：阶段 2 收进库',
}

/** key 构造必须与 frontend/tests/designSystem.test.ts 逐字一致（否则白名单对不上） */
const keyOf = (ctx, sel) => (normCtx(ctx) ? normCtx(ctx) + ' ' : '') + sel

const files = {}
for (const r of physics) {
  if (r.file === 'components/lift.css') continue
  files[r.file] = files[r.file] || []
  const key = keyOf(r.context, r.sel)
  if (!files[r.file].includes(key)) files[r.file].push(key)
}
for (const f of Object.keys(files)) files[f].sort()
// 已不存在的文件直接剔除（删过的 CSS 不该在基线里阴魂不散，否则"剩余 N 条"虚高）
for (const f of Object.keys(files)) if (!fs.existsSync("frontend/src/styles" + '/' + f)) delete files[f]

// 跨文件同名（同一 key 出现在 ≥2 文件）——阶段 1 已修 5 处，剩余的登记在案
const byKey = new Map()
for (const r of physics) {
  const key = keyOf(r.context, r.sel)
  if (!byKey.has(key)) byKey.set(key, [])
  byKey.get(key).push(r)
}
const crossFile = []
for (const [key, rs] of byKey) {
  const uniq = [...new Set(rs.map((r) => r.file))]
  if (uniq.length > 1) crossFile.push({ key, files: uniq, reason: '阶段 2 迁移时消除：两处定义、后者按导入顺序胜出' })
}

const out = {
  note: '自动生成（tooling/uiux-physics-baseline.mjs）：微交互库之外的存量交互物理 = 阶段 2 迁移清单。护栏只拦新增；清完一处就跑脚本收窄一次。',
  generatedFrom: 'frontend/src/styles/**/*.css',
  files,
  crossFileDuplicates: crossFile,
}
fs.mkdirSync('frontend/tests/fixtures', { recursive: true })
fs.writeFileSync('frontend/tests/fixtures/physics-baseline.json', JSON.stringify(out, null, 1) + '\n')

let total = 0
for (const f of Object.keys(files)) total += files[f].length
console.log('基线：' + Object.keys(files).length + ' 个文件 / ' + total + ' 条交互选择器 / 跨文件同名 ' + crossFile.length + ' 组')
for (const d of crossFile) console.log('  ⚠ ' + d.key + '  ← ' + d.files.join(' + '))
