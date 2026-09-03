// 厂商图标（本地化，不热链）
//
// 来源与取舍（2026-08-31 实测）：
// - models.dev 的 api.json **没有 logo 字段**（212 个 provider，0 个带图标）→ 走不通；
// - Simple Icons 覆盖我们真实数据 9 个厂商里的 6~7 个；`openai` / `xai` / `tencent` / `zhipu`
//   在其 CDN 上就是 404（该库有商标下架史），**没有的就不伪造品牌标识**；
// - 缺失的厂商退回字母印章（`EntityStamp` 现有形态，已经是厂商配色 + 首字母，识别度够用）。
//
// 加新厂商：把 SVG 放进 `frontend/public/vendor-logos/<key>.svg`，在下面的表里加一行
// （key 用归一化后的厂商名：小写、去空格与连字符）。图标建议单色黑，落在厂商色底上。
const LOGOS: Record<string, string> = {
  deepseek: '/vendor-logos/deepseek.svg',
  qwen: '/vendor-logos/qwen.svg',
  tongyi: '/vendor-logos/qwen.svg',
  anthropic: '/vendor-logos/anthropic.svg',
  kimi: '/vendor-logos/kimi.svg',
  moonshot: '/vendor-logos/kimi.svg',
  google: '/vendor-logos/google.svg',
  gemini: '/vendor-logos/google.svg',
  minimax: '/vendor-logos/minimax.svg',
  zai: '/vendor-logos/zai.svg',
  zhipu: '/vendor-logos/zai.svg',
  zhipuai: '/vendor-logos/zai.svg',
}

function norm(vendor: string): string {
  return vendor.toLowerCase().replace(/[\s._-]+/g, '')
}

/** 厂商名 → 本地图标路径；没有则返回 null（调用方退回字母印章） */
export function vendorLogo(vendor?: string | null): string | null {
  if (!vendor) return null
  const key = norm(vendor)
  if (LOGOS[key]) return LOGOS[key]
  // "Tencent Cloud" / "Zhipu AI" 这类带后缀的写法：按首个词再试一次
  const head = key.split(/[^\p{L}\p{N}]/u)[0]
  return LOGOS[head] ?? null
}
