import type { Announcement } from '../api/types'
import { timeAgo } from './time'
import { lang } from '../i18n'

export { timeAgo }

export const annTypeMeta: Record<string, { label: string; cls: string }> = {
  manual: { label: '公告', cls: 'ann-card-manual' },
  auto: { label: '新发布', cls: 'ann-card-auto' },
  demo_update: { label: '作品更新', cls: 'ann-card-demo' },
  update: { label: '站点更新', cls: 'ann-card-update' },
}

/** EN 侧公告类型标签（与 i18n/en.ts 的 ann 段保持一致） */
const ANN_LABELS_EN: Record<string, string> = {
  manual: 'Notice',
  auto: 'New',
  demo_update: 'Demo updated',
  update: 'Site updated',
}

/** tip 内容优先级：手动公告 > 新发布 > 作品更新 > 站点更新（防 git log 刷屏盖住手动公告） */
export const ANN_PRIORITY: string[] = ['manual', 'auto', 'demo_update', 'update']

export function annCls(type: string) {
  return annTypeMeta[type]?.cls || 'ann-card-manual'
}

export function annLabel(type: string) {
  if (lang.value === 'en') return ANN_LABELS_EN[type] || type || 'Notice'
  return annTypeMeta[type]?.label || type || '公告'
}

/** 按优先级取一条置顶公告（列表按时间倒序传入） */
export function pickAnnouncementTip(items: Announcement[]): Announcement | null {
  for (const t of ANN_PRIORITY) {
    const found = items.find((a) => a.type === t)
    if (found) return found
  }
  return items[0] || null
}

// ---- 未读跟踪（M1-2 首页枢纽侧栏徽章）----
// 最小机制：以「已见过的最大公告 id」为水位线（公告 id 单调递增），localStorage 持久。
// 打开任一公告弹层即视为全部已读（运营语义：弹开看过了就算送达）。
const ANN_READ_KEY = 'dsh_ann_read_max'

function readMaxId(): number {
  try {
    return Number(localStorage.getItem(ANN_READ_KEY) || '0')
  } catch {
    return Number.MAX_SAFE_INTEGER // 隐私模式写不进 → 恒显示已读，不制造假徽章
  }
}

/** 未读数 = id 高于水位线的公告数（响应式由调用方 tick 驱动） */
export function annUnreadCount(items: Announcement[]): number {
  const max = readMaxId()
  return items.filter((a) => a.id > max).length
}

export function markAnnouncementsRead(items: Announcement[]) {
  try {
    const cur = readMaxId()
    const maxId = items.reduce((n, a) => Math.max(n, a.id), cur)
    if (maxId > cur) localStorage.setItem(ANN_READ_KEY, String(maxId))
  } catch {
    /* 隐私模式：读态不落盘，徽章本次会话内仍工作 */
  }
}
