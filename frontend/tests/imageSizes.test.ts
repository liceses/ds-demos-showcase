// 图片尺寸护栏：把「每张图只加载它需要的像素」钉成测试
//
// 背景（线上实测，2026-09）：站内 14 处上下文在直接加载 1280px 原图（平均 63KB），
// 而它们的显示尺寸从 34×24 到 308×154 不等 —— 个人主页一页 **23 张图 1510KB**。
// 缩略图（200）与卡片图（640）早就该覆盖这些上下文，但此前只有探索页题目行用了。
//
// 本文件钉三件事：
//   ① URL 规则与后端一致（两侧读同一份 fixtures/cover-url-cases.json）；
//   ② 全站不许再出现「裸 <img> 直接吃 cover_url 原图」（白名单只有 tier="full" 的大图上下文）；
//   ③ srcset 阶梯必须带原图候选（否则 2x 屏没有可退的档）。
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { COVER_FULL_WIDTH, COVER_TIER_SPEC, coverSrcset, hasSizedCover, sizedCoverUrl } from '../src/utils/coverUrl'

const SRC = path.resolve(import.meta.dirname, '../src')
const fixture = JSON.parse(readFileSync('tests/fixtures/cover-url-cases.json', 'utf8')) as {
  cases: { url: string; thumb: string; card: string; why: string }[]
}

describe('① 封面 URL 规则：与后端共用同一份用例', () => {
  it('每一例 thumb/card 都与 fixture 一致', () => {
    const bad: string[] = []
    for (const c of fixture.cases) {
      const thumb = sizedCoverUrl(c.url, 'thumb')
      const card = sizedCoverUrl(c.url, 'card')
      if (thumb !== c.thumb) bad.push(`${c.url} thumb 期望 ${JSON.stringify(c.thumb)} 实得 ${JSON.stringify(thumb)}（${c.why}）`)
      if (card !== c.card) bad.push(`${c.url} card 期望 ${JSON.stringify(c.card)} 实得 ${JSON.stringify(card)}（${c.why}）`)
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('档位像素值必须与后端一致（200 / 640）', () => {
    expect(COVER_TIER_SPEC.thumb[1]).toBe(200)
    expect(COVER_TIER_SPEC.card[1]).toBe(640)
    expect(COVER_FULL_WIDTH).toBe(1280)
  })

  it('full 档永远返回原图；无小图时 hasSizedCover 为 false（调用方据此回落）', () => {
    expect(sizedCoverUrl('/media/default.svg', 'full')).toBe('/media/default.svg')
    expect(sizedCoverUrl('/media/covers/abc.webp', 'full')).toBe('/media/covers/abc.webp')
    expect(hasSizedCover('/media/default.svg')).toBe(false)
    expect(hasSizedCover('/media/covers/abc.webp')).toBe(true)
    expect(hasSizedCover('/media/covers/abc.webp', 'card')).toBe(true)
    expect(hasSizedCover(null)).toBe(false)
  })

  it('srcset 阶梯：200w + 640w + 原图 1280w；没有小图时返回空串', () => {
    const s = coverSrcset('/media/covers/abc.webp')
    expect(s).toContain('/media/covers/abc-thumb.webp 200w')
    expect(s).toContain('/media/covers/abc-card.webp 640w')
    expect(s).toContain('/media/covers/abc.webp 1280w')
    expect(coverSrcset('/media/default.svg')).toBe('')
  })
})

describe('② 全站图片必须走 CoverImg / 尺寸函数（不许裸吃原图）', () => {
  function* walk(dir: string): Generator<string> {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) yield* walk(p)
      else if (/\.(vue|ts)$/.test(e.name)) yield p
    }
  }

  /** 一个 <img>/<CoverImg 标签是否"合法吃封面"（回看 400 字符：拼 HTML 串的场景，尺寸算在上一行） */
  const legit = (tag: string, before = '') =>
    tag.startsWith('<CoverImg') || // 组件 = 唯一出口（档位与降级由它负责）
    /tier="full"/.test(tag) || // 明确要原图的大图上下文（详情封面 / 首页 hero）
    /sizedCoverUrl\(|cover_thumb_url/.test(tag + before) || // 纯函数（v-html 拼串）或后端已给的 200 档字段
    /avatar/.test(tag) // 头像不是封面（本轮范围外）

  it('views/components/astra 里没有"裸 <img> 吃 cover_url"的漏网之鱼', () => {
    const offenders: string[] = []
    for (const f of walk(SRC)) {
      if (f.endsWith(path.join('components', 'CoverImg.vue'))) continue // 组件自身实现
      const src = readFileSync(f, 'utf8')
      const re = /<(img|CoverImg)\b[^>]*>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const tag = m[0]
        if (!/cover/i.test(tag) || !/(src|:src)=/.test(tag)) continue
        if (legit(tag, src.slice(Math.max(0, m.index - 400), m.index))) continue
        const line = src.slice(0, m.index).split('\n').length
        offenders.push(`${f.replace(SRC, 'src')}:${line} → ${tag.replace(/\s+/g, ' ').slice(0, 90)}`)
      }
    }
    expect(offenders, '这些地方还在直接加载封面原图（改用 CoverImg 并给 tier/sizes）：\n' + offenders.join('\n')).toEqual([])
  })

  it('卡片类上下文（DemoCard）必须给 sizes —— 否则 srcset 会按 100vw 挑最大的档', () => {
    const card = readFileSync(path.join(SRC, 'components/DemoCard.vue'), 'utf8')
    expect(card).toMatch(/<CoverImg[^>]*tier="card"[^>]*sizes="/)
  })
})
