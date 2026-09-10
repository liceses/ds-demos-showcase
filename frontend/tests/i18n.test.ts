// RF-1 安全网：i18n 词表完整性（fs 扫描 + 纯数据导入，零 DOM）。
//
// 背景：全仓 1475 处 `t('key', '中文')` 把中文内联在调用点、英文放在 en.ts ——
// 同一句文案存两份，且已经出过实际事故：
//   · 15 个 key 在不同调用点的内联中文互相矛盾，而 EN 只有一条 → 英文站说错话；
//   · 2 个 key 在 en.ts 里根本不存在 → 英文站回落中文（dev 控制台才警告）；
//   · 28 条 en.ts 死词条（改文案留下的化石）。
// 这个文件把这三类问题变成**测试失败**，而不是靠人肉巡检。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { en } from '../src/i18n/en'

const ROOT = 'src'

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = dir + '/' + e
    if (statSync(p).isDirectory()) yield* files(p)
    else if (/\.(vue|ts)$/.test(e) && !e.endsWith('.d.ts') && !p.includes('/i18n/en.ts')) yield p
  }
}

/** en.ts 的叶子 key 集合（点分路径）。数组整体算一个叶子：
 *  数组词条通过 tArr('taglines', …) 按父 key 取用，展开成下标会造出 taglines.0 这类假阳性。 */
function leaves(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [prefix]
  if (obj == null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  )
}

/** 解析模板/脚本里的 t('key', '中文') 与 tArr('key', [...]) */
function scanUsages(): { key: string; zh: string; file: string; line: number }[] {
  const out: { key: string; zh: string; file: string; line: number }[] = []
  // 只匹配字面量 key（动态 key 如 t(`a.${x}`) 另行统计前缀）；单双引号都收
  const re = /\bt(?:Arr)?\(\s*['"]([a-zA-Z0-9_.]+)['"]\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|\[)/g
  for (const f of files(ROOT)) {
    const text = readFileSync(f, 'utf8')
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        out.push({ key: m[1], zh: m[2] ?? m[3] ?? '<array>', file: f, line: i + 1 })
      }
    })
  }
  return out
}

/** 动态 key 的前缀集合（t(`admin.kc.status.${x}`) → admin.kc.status.） */
function dynamicPrefixes(): string[] {
  const out = new Set<string>()
  const re = /\bt(?:Arr)?\(\s*`([^`]*?)\$\{/g
  for (const f of files(ROOT)) {
    for (const m of readFileSync(f, 'utf8').matchAll(re)) out.add(m[1])
  }
  return [...out]
}

const usages = scanUsages()
const definedLeaves = new Set(leaves(en))

describe('i18n 词表完整性', () => {
  it('扫描到的调用点数量合理（防扫描器自身失效）', () => {
    expect(usages.length).toBeGreaterThan(800)
  })

  it('每个用到的 key 都在 en.ts 里有英文词条（缺 key 会让英文站回落中文）', () => {
    const missing = [...new Set(usages.filter((u) => !definedLeaves.has(u.key)).map((u) => u.key))]
    expect(missing, `en.ts 缺这些 key：\n${missing.join('\n')}`).toEqual([])
  })

  it('同一个 key 的内联中文必须唯一（矛盾文案会让英文站说错话）', () => {
    const byKey = new Map<string, Map<string, string[]>>()
    for (const u of usages) {
      if (u.zh === '<array>') continue
      // 归一化只看语义：去掉尾部标点/箭头/省略号与空白。
      // 「发帖」vs「发帖 →」、「已提交，等待审核」vs「…。」这类差异不是缺陷；
      // 而「理由（可选）」vs「理由（必填）」这类必须拦（EN 只有一条，英文站必然说错话）。
      const norm = u.zh.replace(/[。，,；;、→…\s]+$/g, '').trim()
      if (!byKey.has(u.key)) byKey.set(u.key, new Map())
      const variants = byKey.get(u.key)!
      const where = `${u.file}:${u.line}`
      variants.set(norm, [...(variants.get(norm) ?? []), where])
    }
    const conflicts = [...byKey.entries()]
      .filter(([, variants]) => variants.size > 1)
      .map(([key, variants]) => {
        const lines = [...variants.entries()].map(([zh, where]) => `      「${zh}」 ← ${where.join(', ')}`)
        return `  ${key}:\n${lines.join('\n')}`
      })
    expect(conflicts, `同一 key 存在互相矛盾的内联中文：\n${conflicts.join('\n')}`).toEqual([])
  })

  it('en.ts 没有死词条（保守判定：父路径在源码里出现过就不算死）', () => {
    const usedKeys = new Set(usages.map((u) => u.key))
    const prefixes = dynamicPrefixes()
    // 整个 src 的原文（用于检测「父路径被拼出来」这类动态构造：
    // 例如 `t(\`${'notifications.types.' + type}\`)` 里 notifications.types. 是字面量，
    // 但 t() 的参数是拼接结果，静态扫描看不到具体 key）
    let srcText = ''
    for (const f of files(ROOT)) srcText += readFileSync(f, 'utf8')
    const dead = [...definedLeaves].filter((k) => {
      if (usedKeys.has(k)) return false
      if (prefixes.some((p) => k.startsWith(p) || p.startsWith(k + '.'))) return false
      const parent = k.includes('.') ? k.slice(0, k.lastIndexOf('.') + 1) : ''
      if (parent && srcText.includes(parent)) return false // 父路径被引用 = 可能是动态构造，放过
      const leaf = k.slice(k.lastIndexOf('.') + 1)
      if (new RegExp(`['"\`]${leaf}['"\`]`).test(srcText)) return false // 末段单独被引用
      return true
    })
    expect(dead, `en.ts 里这些 key 确定无人使用（可删）：\n${dead.join('\n')}`).toEqual([])
  })
})
