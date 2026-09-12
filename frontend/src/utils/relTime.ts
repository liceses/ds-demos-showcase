import { currentLocale } from './time'

/**
 * 相对时间与按天分组（浏览历史页专用）。
 *
 * 为什么单独抽出来：历史页与「我的」页的"最近浏览"区块都要用同一套口径，
 * 两处各写一遍必然出现"3 分钟前"和"刚刚"两种说法。放这里可以单测。
 */

const MIN = 60_000
const HOUR = 60 * MIN

/** "刚刚 / N 分钟前 / N 小时前 / 昨天 HH:mm / M月D日 / YYYY年M月D日" */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return ''
  const diff = now - ts
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`
  if (diff < 24 * HOUR && sameDay(ts, now)) return `${Math.floor(diff / HOUR)} 小时前`
  if (sameDay(ts, now - 24 * HOUR)) return `昨天 ${hhmm(ts)}`
  const d = new Date(ts)
  if (d.getFullYear() === new Date(now).getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 分组标题："今天 / 昨天 / M月D日 / YYYY年M月D日"（历史页的 .hist-day） */
export function dayLabel(iso: string, now: number = Date.now()): string {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return ''
  if (sameDay(ts, now)) return '今天'
  if (sameDay(ts, now - 24 * HOUR)) return '昨天'
  const d = new Date(ts)
  if (d.getFullYear() === new Date(now).getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 按天分组（保持输入顺序，输入应先按时间倒序） */
export function groupByDay<T extends { viewed_at: string }>(rows: T[], now: number = Date.now()): Array<{ label: string; rows: T[] }> {
  const out: Array<{ label: string; rows: T[] }> = []
  for (const r of rows) {
    const label = dayLabel(r.viewed_at, now)
    const last = out[out.length - 1]
    if (last && last.label === label) last.rows.push(r)
    else out.push({ label, rows: [r] })
  }
  return out
}

function sameDay(a: number, b: number): boolean {
  const x = new Date(a)
  const y = new Date(b)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
}

function hhmm(ts: number): string {
  return new Date(ts).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })
}
