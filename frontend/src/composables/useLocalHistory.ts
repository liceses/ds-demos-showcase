import { ref } from 'vue'
import type { DemoSummary, HistoryItemOut, LocalHistoryItem } from '../api/types'

/**
 * 本机浏览历史（localStorage）。
 *
 * 为什么有它（用户裁决：历史 = **混合**存储）：
 *   · 未登录用户也要有"上次看到哪了" → 服务端一无所知，只写本机；
 *   · 登录后服务端也记一份（跨设备），本机这份继续作为"这台设备的最近记录"。
 * 两者在上层按 slug 合并去重（见 mergeHistory），所以同一个作品不会显示两遍。
 *
 * 隐私口径（与 services/visits.py 的"不收集访客 IP"一致）：只存
 * slug / 标题 / 封面 / 模型名 / 时间戳，**不存 IP、不存来源页、不存停留时长**。
 */
export const LOCAL_HISTORY_KEY = 'demo.history.v1'
/** 本机上限（服务端另有 200 条上限；两者独立裁剪） */
export const LOCAL_HISTORY_MAX = 100

function safeRead(): LocalHistoryItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 防御脏数据：只接受形状正确的行（手改 localStorage / 旧版本残留都不该让页面炸）
    return parsed.filter((x): x is LocalHistoryItem => {
      if (!x || typeof x !== 'object') return false
      const o = x as Record<string, unknown>
      return typeof o.slug === 'string' && typeof o.ts === 'number' && o.slug.length > 0
    })
  } catch {
    return [] // 解析失败 = 当作没有历史，而不是抛错
  }
}

function safeWrite(items: LocalHistoryItem[]): void {
  try {
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(items))
  } catch {
    /* 隐私模式/超额：记不住就算了，绝不影响浏览 */
  }
}

export function useLocalHistory() {
  const items = ref<LocalHistoryItem[]>(safeRead())

  function reload() {
    items.value = safeRead()
  }

  /** 记一次浏览：同 slug 去重置顶，超上限裁掉最旧 */
  function record(demo: Pick<DemoSummary, 'slug' | 'title' | 'cover_url'> & { model_labels?: string[] }) {
    if (!demo.slug) return
    const next = items.value.filter((x) => x.slug !== demo.slug)
    next.unshift({
      slug: demo.slug,
      title: demo.title || demo.slug,
      cover_url: demo.cover_url || '',
      model_labels: demo.model_labels ?? [],
      ts: Date.now(),
    })
    items.value = next.slice(0, LOCAL_HISTORY_MAX)
    safeWrite(items.value)
  }

  function remove(slug: string) {
    items.value = items.value.filter((x) => x.slug !== slug)
    safeWrite(items.value)
  }

  function clear() {
    items.value = []
    try {
      localStorage.removeItem(LOCAL_HISTORY_KEY)
    } catch {
      /* 同上 */
    }
  }

  return { items, record, remove, clear, reload }
}

/** 合并后的展示行（本机与服务端同一形状，前端只认它） */
export interface HistoryRow {
  slug: string
  title: string
  cover_url: string
  model_labels: string[]
  /** ISO 字符串；本机记录的时间戳在这里转成 ISO，便于统一排序与格式化 */
  viewed_at: string
  /** 两个来源都可能有；合并后按 slug 取更近的那次 */
  source: 'local' | 'server'
}

/**
 * 合并本机 + 服务端历史：
 *   · 按 slug 去重，保留**时间更近**的那条（来源也随更近的一条）；
 *   · 按时间倒序；
 *   · limit 用于首页区块的"最近 N 条"。
 */
export function mergeHistory(
  server: HistoryItemOut[],
  local: LocalHistoryItem[],
  limit?: number,
): HistoryRow[] {
  const byslug = new Map<string, HistoryRow>()

  for (const it of server) {
    const d = it.demo
    if (!d?.slug) continue
    byslug.set(d.slug, {
      slug: d.slug,
      title: d.title || d.slug,
      cover_url: d.cover_url || '',
      model_labels: (d.models ?? []).map((m) => m.name || m.slug).filter(Boolean),
      viewed_at: it.viewed_at,
      source: 'server',
    })
  }

  for (const it of local) {
    const iso = new Date(it.ts).toISOString()
    const prev = byslug.get(it.slug)
    if (prev && prev.viewed_at >= iso) continue // 服务端那条更新 → 保留它
    byslug.set(it.slug, {
      slug: it.slug,
      title: it.title || it.slug,
      cover_url: it.cover_url || '',
      model_labels: it.model_labels ?? [],
      viewed_at: iso,
      source: 'local',
    })
  }

  const rows = [...byslug.values()].sort((a, b) => b.viewed_at.localeCompare(a.viewed_at))
  return typeof limit === 'number' ? rows.slice(0, limit) : rows
}
