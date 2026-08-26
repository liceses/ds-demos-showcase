/** 解析后端时间：无时区标记的 naive UTC 按 UTC 解析，避免被当成本地时间提前 8 小时 */
export function parseDate(iso: string): Date {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return new Date(iso)
  return new Date(iso + 'Z')
}

/** 相对时间格式化（全站统一） */
export function timeAgo(iso: string): string {
  const diff = Date.now() - parseDate(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return parseDate(iso).toLocaleDateString('zh-CN')
}
