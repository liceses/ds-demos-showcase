// P2 跨页收敛 · 护栏（fs 扫描 + 纯文本断言，零 DOM）。
//
// 背景（实测）：`<EmptyBox>` 组件早已存在，但**语义被混用** —— 后台四个列表
// (`AdminUsersSection` / `AdminAnnouncementsSection` / `AdminForumSection` /
// `AdminTagsSection`) 的 `catch` 都把数据清成 `[]` 就完事，于是"接口挂了"与
// "真的没有数据"渲染出**一模一样**的界面。运维看到「0 个用户」「暂无公告」
// 会以为库空了，而不是先去查服务（功能审计里 4 条 Medium 级缺陷）。
//
// 已修：四处都加了 loadError 标记 + `<EmptyBox kind="error" @retry>`（错误态用实线+错误色，
// 并带 role=alert 与重试出口）。这个文件把"不许再退回混用"变成测试失败。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** 递归列出 src 下的 .vue / .ts（护栏要扫全仓，不能只盯几个文件） */
function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = dir + '/' + e
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(vue|ts)$/.test(e)) yield p
  }
}
const files = (dir: string): string[] => [...walk(dir)]

const ADMIN_LISTS = [
  'src/components/admin/AdminUsersSection.vue',
  'src/components/admin/AdminAnnouncementsSection.vue',
  'src/components/admin/AdminForumSection.vue',
  'src/components/admin/AdminTagsSection.vue',
]

/** 逐列表精确对账：`catch` 里清空这个列表时，必须同时置起对应的失败标记。
 *  用「文件 + 被清空的变量 + 失败标记」三元组而不是"文件里所有 catch"——
 *  后者会把同文件里其它列表（例如 AdminTagsSection 的 demos）也算进来，
 *  而那不是本阶段的口径（护栏太宽会逼人写无意义的标记，最后被绕过）。 */
const GUARDED: { file: string; cleared: string; flag: string }[] = [
  { file: 'AdminUsersSection.vue', cleared: 'users.value', flag: 'loadError' },
  { file: 'AdminAnnouncementsSection.vue', cleared: 'announcements.value', flag: 'loadError' },
  { file: 'AdminForumSection.vue', cleared: 'forumTopics.value', flag: 'topicLoadError' },
  { file: 'AdminForumSection.vue', cleared: 'forumReports.value', flag: 'reportLoadError' },
  { file: 'AdminForumSection.vue', cleared: 'forumRepliesShown.value', flag: 'replyLoadError' },
  { file: 'AdminTagsSection.vue', cleared: 'suggestions.value', flag: 'suggLoadError' },
  { file: 'AdminTagsSection.vue', cleared: 'demos.value', flag: 'tagsLoadError' },
]

function read(p: string): string {
  return readFileSync(p, 'utf8')
}

/** 剥注释：注释里出现的示例代码不该被断言当成违规（踩过） */
function readNoComments(p: string): string {
  return read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

describe('P2 空态/错误态收敛', () => {
  it('后台列表的"加载失败"必须与"空数据"分开', () => {
    for (const { file, cleared, flag } of GUARDED) {
      const src = readNoComments(`src/components/admin/${file}`)
      // ① 有失败标记声明
      expect(src, `${file} 缺少 ${flag} 标记`).toContain(flag)
      // ② 每处清空该列表的 catch 都必须同时置位
      const catches = [...src.matchAll(/catch\s*\{([\s\S]{0,500}?)\n {2}\}/g)].map((m) => m[1])
      const clearing = catches.filter((b) => b.includes(`${cleared} = []`))
      expect(clearing.length, `${file} 找不到清空 ${cleared} 的 catch`).toBeGreaterThan(0)
      for (const block of clearing) {
        expect(block, `${file}: catch 清了 ${cleared} 却没置 ${flag}`).toContain(`${flag}.value = true`)
      }
    }
    // ③ 模板里出现了"加载失败"文案（错误态真的被渲染出来）
    for (const f of ADMIN_LISTS) {
      expect(readNoComments(f), `${f} 没有渲染错误态文案`).toMatch(/加载失败/)
    }
  })

  it('EmptyBox 支持 empty / error / notfound 三种语义', () => {
    const src = read('src/components/EmptyBox.vue')
    for (const kind of ['empty', 'error', 'notfound']) {
      expect(src, `EmptyBox 缺 kind=${kind}`).toContain(`'${kind}'`)
    }
    // error 态必须有可访问性通报与重试出口
    expect(src).toContain("role=\"kind === 'error' ? 'alert' : undefined\"")
    expect(src).toContain("emit('retry')")
    // 三种语义在样式上必须可分（否则"故障"与"没数据"又长得一样）
    const css = read('src/styles/components/skeleton.css')
    expect(css).toContain('.empty-box--error')
    expect(css).toContain('.empty-box--notfound')
  })

  it('后台列表的错误态都有重试出口（不能只报错不给路）', () => {
    for (const f of ADMIN_LISTS) {
      const src = readNoComments(f)
      const hasRetry =
        /@retry=/.test(src) || // EmptyBox 的 retry 事件
        /重试/.test(src) // 表格内联的重试按钮（<tr> 里不能塞 div，只能内联）
      expect(hasRetry, `${f} 的错误态没有重试入口`).toBe(true)
    }
  })
})

describe('P2 页头收敛', () => {
  /** 组件自己就是那个"手写 page-hero"的地方，豁免 */
  const HERO_OWNER = 'src/components/PageHero.vue'
  /** 首页 hero-v2 是品牌封面：D2 决定它保留巨字，不进组件 */
  const BRAND_PAGE = 'src/views/HomeView.vue'

  it('功能页页头一律走 <PageHero>（不许手写 page-hero 段）', () => {
    const offenders: string[] = []
    for (const f of files('src')) {
      if (!f.endsWith('.vue') || f === HERO_OWNER || f === BRAND_PAGE) continue
      readNoComments(f)
        .split('\n')
        .forEach((line, i) => {
          if (/<section[^>]*class="page-hero/.test(line)) offenders.push(`${f}:${i + 1}`)
        })
    }
    expect(offenders, '这些地方还在手写页头段，应改用 <PageHero>').toEqual([])
    // 首页那条豁免必须真的是"品牌变体"，不能变成随便绕过护栏的后门
    expect(read(BRAND_PAGE)).toMatch(/<section[^>]*class="page-hero hero-v2"/)
  })

  it('.huge 只属于首页品牌封面（功能页不许再用巨字档）', () => {
    const offenders: string[] = []
    for (const f of files('src')) {
      if (!f.endsWith('.vue') || f === BRAND_PAGE || f === HERO_OWNER) continue
      readNoComments(f)
        .split('\n')
        .forEach((line, i) => {
          if (/class="huge"/.test(line)) offenders.push(`${f}:${i + 1}`)
        })
    }
    expect(offenders, '功能页又用回 .huge 了（D2：巨字只留首页）').toEqual([])
    // 首页必须**还在用**巨字 —— 否则等于悄悄把品牌封面也降档了
    expect(read(BRAND_PAGE)).toContain('class="huge"')
  })

  it('页标题字号只有一个真源（--fs-title-compact）', () => {
    const css = read('src/styles/components/page-head.css')
    // P2-b 起 .page-title 独立成类，字号走令牌 —— 不许再写回字面 clamp
    expect(css).toMatch(/\.page-title\s*\{[^}]*font-size:\s*var\(--fs-title-compact\)/s)
    expect(css).not.toMatch(/\.page-title\s*\{[^}]*clamp\(/s)
    // 页头变体只有"紧凑"与"详情收紧"两种，且都定义在本文件
    expect(css).toContain('.page-hero--compact')
    expect(css).toContain('.page-hero--tight')
  })
})
