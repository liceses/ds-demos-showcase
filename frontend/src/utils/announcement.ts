import type { Announcement } from '../api/types'
import { timeAgo } from './time'

export { timeAgo }

export const annTypeMeta: Record<string, { label: string; cls: string }> = {
  manual: { label: '公告', cls: 'ann-card-manual' },
  auto: { label: '新发布', cls: 'ann-card-auto' },
  demo_update: { label: '作品更新', cls: 'ann-card-demo' },
  update: { label: '站点更新', cls: 'ann-card-update' },
}

/** tip 内容优先级：手动公告 > 新发布 > 作品更新 > 站点更新（防 git log 刷屏盖住手动公告） */
export const ANN_PRIORITY: string[] = ['manual', 'auto', 'demo_update', 'update']

export function annCls(type: string) {
  return annTypeMeta[type]?.cls || 'ann-card-manual'
}

export function annLabel(type: string) {
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
