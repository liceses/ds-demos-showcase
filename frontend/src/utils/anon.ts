/**
 * 匿名身份：浏览器 localStorage 生成持久 device_id
 * 用于匿名评分（登录用户走 Cookie，无需此 id）。
 */
const KEY = 'ds_anon_device_id'

let cached: string | null = null

export function getDeviceId(): string {
  if (cached) return cached
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id =
        (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(KEY, id)
    }
    cached = id
    return id
  } catch {
    return ''
  }
}
