// 外壳宽度护栏（P3-fix）：
// 用户实测报过「作品集等 tab 页面宽度和顶栏不一致」—— 根因是我上一版只把 main 换成
// --w-wide，而顶栏/页脚仍是 --w-page：1440 屏内容比顶栏宽 57px、1920 屏宽 80px。
// 这类"三个元素各自定宽"的漂移必须由机器挡：宽度只能有一个真源（--w-shell），
// 且顶栏与页脚**不许自己写宽度**。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname, '../src')

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), 'utf8')
}

/** 取出某个选择器的规则体（顶层，不含媒体查询内的同名规则） */
function ruleBody(css: string, selector: string): string {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm')
  const m = re.exec(css)
  return m ? m[2] : ''
}

describe('外壳宽度（顶栏 / 主区 / 页脚必须同宽）', () => {
  const container = read('styles/layouts/container.css')

  it('.container 的宽度取 var(--w-shell) —— 它是三处共用的唯一真源', () => {
    expect(ruleBody(container, '.container')).toMatch(/width:\s*var\(--w-shell\)/)
    // 不许退回字面量或只给 main 用的旧类
    expect(ruleBody(container, '.container')).not.toMatch(/width:\s*min\(/)
    expect(container).not.toContain('.container--wide')
  })

  it('.shell-wide 只换绑 --w-shell（整个外壳一起换档）', () => {
    const body = ruleBody(container, '.shell-wide')
    expect(body).toMatch(/--w-shell:\s*var\(--w-wide\)/)
    // 不许在这里直接写 width（那会变成"只有某个元素变宽"的老毛病）
    expect(body).not.toMatch(/(^|[^-])width:/)
  })

  it('--w-shell 在令牌层有默认值', () => {
    const tokens = read('styles/tokens/primitives.css')
    expect(tokens).toMatch(/--w-shell:\s*var\(--w-page\)/)
  })

  it('顶栏与页脚自己不写宽度（否则又会出现三个元素各定其宽）', () => {
    for (const [file, sel] of [
      ['styles/layouts/topbar.css', '.topbar'],
      ['styles/layouts/footer.css', '.footer'],
    ] as const) {
      const body = ruleBody(read(file), sel)
      expect(body, `${file} 的 ${sel} 不该声明 width`).not.toMatch(/(^|[^-])width\s*:/)
      expect(body, `${file} 的 ${sel} 不该声明 max-width`).not.toMatch(/max-width\s*:/)
    }
  })

  it('宽档挂在外壳根（.app-shell）上，而不是挂在 main 上', () => {
    const app = read('App.vue')
    // 外壳根带 shell-wide
    expect(app).toMatch(/class="app-shell"[^>]*'shell-wide':\s*route\.meta\.wide/)
    // main 只挂 container（+ 论坛壳），不再单独带宽档
    expect(app).toMatch(/<main class="container"/)
    expect(app).not.toContain('container--wide')
  })
})
