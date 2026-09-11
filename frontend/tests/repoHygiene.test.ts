// 仓库卫生护栏：受跟踪的 PowerShell 脚本若含非 ASCII 字符，**必须**带 UTF-8 BOM。
//
// 为什么值得一条测试（真实事故）：`start-dev.ps1` 里有大量中文 Write-Host 文案。
// 一次编辑把它写成了"UTF-8 无 BOM"，而：
//   · PowerShell 7（我在校验时用的）默认按 UTF-8 读无 BOM 文件 → **解析通过**；
//   · Windows PowerShell 5.1（用户双击 .bat 实际在用的）按 **ANSI/GBK** 读无 BOM 文件
//     → 中文字符串被撕碎 → 报 "The string is missing the terminator" 外加一串
//     莫名其妙的 "Missing closing '}'"（错误位置离根因十万八千里）。
// 结论：这类"只在别人的解释器上炸"的问题，必须由机器挡，且**要在 5.1 的语义下判**。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')

function trackedPs1(): string[] {
  try {
    return execFileSync('git', ['ls-files', '*.ps1'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return [] // 非 git 环境（例如打包后的源码）不判这条
  }
}

function hasBom(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
}

function hasNonAscii(buf: Buffer): boolean {
  for (const b of buf) if (b >= 0x80) return true
  return false
}

describe('仓库卫生', () => {
  it('含中文的 .ps1 必须带 UTF-8 BOM（否则 Windows PowerShell 5.1 解析必炸）', () => {
    const files = trackedPs1()
    expect(files.length, '没有找到受跟踪的 .ps1（git 不可用？）').toBeGreaterThan(0)

    const offenders: string[] = []
    for (const f of files) {
      const buf = readFileSync(path.join(REPO_ROOT, f))
      if (hasNonAscii(buf) && !hasBom(buf)) offenders.push(f)
    }
    expect(
      offenders,
      '这些脚本含非 ASCII 字符却没有 BOM —— Windows PowerShell 5.1 会按 ANSI 读，' +
        '中文字符串被撕碎并报出一串与根因无关的语法错误。修法：在文件开头补 EF BB BF。',
    ).toEqual([])
  })

  it('start-dev.bat 保持纯 ASCII（cmd 对 BOM/中文都不友好，脚本本体不该有中文）', () => {
    const bat = path.join(REPO_ROOT, 'start-dev.bat')
    const buf = readFileSync(bat)
    expect(hasNonAscii(buf), 'start-dev.bat 出现了非 ASCII 字符：cmd 会按 OEM 码页读，' + '中文极易乱码，请把中文提示放进 .ps1').toBe(false)
    expect(hasBom(buf), 'start-dev.bat 不该带 BOM：cmd 会把 BOM 当命令的一部分打印出来').toBe(false)
  })
})
