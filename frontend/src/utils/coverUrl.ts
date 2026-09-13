/**
 * 封面小图 URL 规则（前端的**唯一定义处**）—— 与后端 `storage.cover_sized_url()` 同一套规则：
 * 两端读同一份用例（`frontend/tests/fixtures/cover-url-cases.json`），防止悄悄分叉。
 *
 * `/media/covers/<stem>.webp` → `<stem>-thumb.webp`(200) / `<stem>-card.webp`(640)
 * 以下情况**没有小图**，只能回落到原图（返回 ""）：
 *   · SVG（含站内 default.svg，栅格化不了）；· 历史非 webp 封面；· 非 covers 路径（外链）；· 空值
 *
 * 为什么放在前端推导、而不是后端每个接口多吐一个字段：`cover_url` 出现在列表、详情、
 * 收藏 `cover_urls[]`、服务端历史，以及**浏览器本机历史（localStorage 里存的就是原图 URL）**——
 * 按 URL 推导规则，这些地方一处都不用改，本机历史也不用迁移。
 */
export type CoverTier = 'thumb' | 'card' | 'full'

const PREFIX = '/media/covers/'
/** 档位 → [文件名后缀, 最长边像素]。像素值必须与后端 storage.COVER_TIERS 一致。 */
export const COVER_TIER_SPEC: Record<'thumb' | 'card', readonly [string, number]> = {
  thumb: ['-thumb', 200],
  card: ['-card', 640],
}
/** 原图最长边（compress_cover 的产物），仅用于 srcset 里声明原图候选宽度 */
export const COVER_FULL_WIDTH = 1280

function stemOf(url: string): string {
  if (!url.startsWith(PREFIX) || !url.toLowerCase().endsWith('.webp')) return ''
  const stem = url.slice(PREFIX.length, -'.webp'.length)
  if (!stem || stem.includes('/') || stem.includes('\\')) return ''
  return stem
}

/** 某个档位的 URL；''= 没有这一档（调用方回落原图） */
export function sizedCoverUrl(url: string | null | undefined, tier: CoverTier): string {
  const raw = (url || '').trim()
  if (tier === 'full') return raw
  const stem = stemOf(raw)
  if (!stem) return ''
  const suffix = COVER_TIER_SPEC[tier][0]
  // 幂等：已经是任意档位后缀的都认得，不再叠加（也避免把 -thumb 当成 -card 的 stem）
  for (const [other] of Object.values(COVER_TIER_SPEC)) {
    if (stem.endsWith(other)) return other === suffix ? raw : ''
  }
  return `${PREFIX}${stem}${suffix}.webp`
}

/** 是否有可用的指定档位小图 */
export function hasSizedCover(url: string | null | undefined, tier: CoverTier = 'thumb'): boolean {
  return !!sizedCoverUrl(url, tier)
}

/**
 * srcset 阶梯字符串（`... 200w, ... 640w, 原图 1280w`）。
 *
 * 为什么不传 sizes 就别用 srcset：没有 sizes 时浏览器按 100vw 估宽 → 会去挑最大的候选，
 * 等于白用小图。所以调用方要么给 sizes（卡片类），要么就让 CoverImg 用普通 src（固定小尺寸）。
 */
export function coverSrcset(url: string | null | undefined): string {
  const raw = (url || '').trim()
  const thumb = sizedCoverUrl(raw, 'thumb')
  const card = sizedCoverUrl(raw, 'card')
  if (!thumb || !card) return ''
  return `${thumb} ${COVER_TIER_SPEC.thumb[1]}w, ${card} ${COVER_TIER_SPEC.card[1]}w, ${raw} ${COVER_FULL_WIDTH}w`
}
