// 实体选择器数据源表（07 §1.2 / 08 §4.2-4.3 / T5·M5-F2）：kind → 搜索函数/展示列/标识。
// 每行返回归一化 EntityPick（id+slug+label+meta+status 按需给），组件不感知具体 API。
// 纪律：只用既有公开/管理端点（契约只增不改）；搜索即选（250ms 防抖在组件层）；
// demo 变体的 slug/作者维度 = 前端并发兜底（结果不足时并查 author + 本地 slug 前缀），
// 仍不足由组件给「手动 slug 确认」诚实出口（manualSlug prop）——不达预期记后端协作项。

import { api } from '../../api'
import type { DemoSummary, ForumTopic, ModelSummary, TaskSummary } from '../../api/types'
import { t } from '../../i18n'
import { modelDisplay } from '../../utils/modelDisplay'

/** kind：demo/model/task/topic/tag 五个变体 + 旧面板的复数写法（models/tasks/topics 归一进基座） */
export type PickerKind = 'demo' | 'model' | 'task' | 'topic' | 'tag' | 'models' | 'tasks' | 'topics'

/** 数据面：admin=管理端点（看 candidate/deprecated/全量）；public=公开端点（已上架/已确认） */
export type PickerSource = 'admin' | 'public'

/** 输出 = 被选实体标识（id + slug + label 一起回，消费方按需取） */
export interface EntityPick {
  id?: number | null
  slug?: string | null
  label: string
  meta?: string
  status?: string
  [k: string]: unknown
}

export interface SearchOutcome {
  rows: EntityPick[]
  total: number
  /** demo 专属：主搜索零命中后是否已跑过 slug/作者兜底（用于诚实文案） */
  slugFallback?: boolean
}

export function normalizeKind(kind: PickerKind): PickerKind {
  if (kind === 'models') return 'model'
  if (kind === 'tasks') return 'task'
  if (kind === 'topics') return 'topic'
  return kind
}

const n = (label: string, meta: string | undefined, extra: Partial<EntityPick> = {}): EntityPick => {
  const p: EntityPick = { label }
  if (meta) p.meta = meta
  return { ...p, ...extra }
}

// ---------- 各 kind 的搜索行（返回 {rows,total}；分页统一 page_size=30，组件只取前 30） ----------

async function searchDemo(q: string): Promise<SearchOutcome> {
  const lq = q.trim()
  // 空查询：拉最近一批当候选（07「搜索即选」空态给最近）
  if (!lq) {
    const r = await api.listDemos({ status: 'approved', sort: 'newest', page: 1, page_size: 30 })
    return {
      total: r.total,
      rows: r.items.map((d) =>
        n(d.title, [d.author, `${d.view_count} ${t('entityPicker.views', '浏览')}`].filter(Boolean).join(' · '), {
          id: null,
          slug: d.slug,
          status: d.status,
          author: d.author,
        }),
      ),
    }
  }
  // 主搜索（后端 q 已覆盖标题/描述/标签）
  const primary = await api.listDemos({ status: 'approved', q: lq, page: 1, page_size: 30 })
  if (primary.total > 0) {
    return {
      total: primary.total,
      rows: primary.items.map((d) =>
        n(d.title, [d.author, `${d.view_count} ${t('entityPicker.views', '浏览')}`].filter(Boolean).join(' · '), {
          id: null,
          slug: d.slug,
          status: d.status,
          author: d.author,
        }),
      ),
    }
  }
  // 前端并发兜底（08 §4.3）：作者精确命中 + 本地 slug 前缀过滤（后端未搜 slug/作者维度）
  const lower = lq.toLowerCase()
  const [authR, recent] = await Promise.all([
    api.listDemos({ status: 'approved', author: lq, page: 1, page_size: 10 }),
    api.listDemos({ status: 'approved', sort: 'newest', page: 1, page_size: 100 }),
  ])
  const seen = new Set<string>()
  const rows: EntityPick[] = []
  const push = (d: DemoSummary) => {
    if (seen.has(d.slug)) return
    seen.add(d.slug)
    rows.push(
      n(d.title, [d.author, `${d.view_count} ${t('entityPicker.views', '浏览')}`].filter(Boolean).join(' · '), {
        id: null,
        slug: d.slug,
        status: d.status,
        author: d.author,
      }),
    )
  }
  for (const d of authR.items) push(d)
  for (const d of recent.items) if (d.slug.toLowerCase().startsWith(lower)) push(d)
  return { rows, total: rows.length, slugFallback: rows.length > 0 }
}

async function searchModel(q: string, source: PickerSource): Promise<SearchOutcome> {
  const rows: ModelSummary[] =
    source === 'public'
      ? (await api.listModels({ q: q.trim() || undefined, page_size: 30 })).items
      : (await api.adminListModels({ q: q.trim() || undefined, page_size: 30 })).items
  return {
    total: rows.length,
    rows: rows.map((m) =>
      n(
        modelDisplay(m),
        [
          m.vendor || '',
          `${m.demo_count} ${t('entityPicker.works', '{n} 件', { n: m.demo_count })}`,
          m.resolution && m.resolution !== 'exact' ? m.resolution : '',
          m.status,
        ]
          .filter(Boolean)
          .join(' · '),
        { id: m.id, slug: m.slug, status: m.status, vendor: m.vendor, aliases: (m as ModelSummary & { aliases?: string[] }).aliases },
      ),
    ),
  }
}

async function searchTask(q: string, source: PickerSource): Promise<SearchOutcome> {
  const rows: TaskSummary[] =
    source === 'public'
      ? (await api.listTasks({ q: q.trim() || undefined, page_size: 30 })).items
      : (await api.adminListEntityTasks({ q: q.trim() || undefined, page_size: 30 })).items
  return {
    total: rows.length,
    rows: rows.map((k) =>
      n(
        k.title,
        [k.category || '', `${k.demo_count} ${t('entityPicker.works', '{n} 件', { n: k.demo_count })}`, k.status]
          .filter(Boolean)
          .join(' · '),
        { id: k.id, slug: k.slug, status: k.status, category: k.category },
      ),
    ),
  }
}

async function searchTopic(q: string): Promise<SearchOutcome> {
  const r = await api.listForumTopics({ q: q.trim() || undefined, page_size: 30 })
  return {
    total: r.total,
    rows: r.items.map((tp: ForumTopic) =>
      n(tp.title, [tp.category, `${tp.reply_count} ${t('entityPicker.replies', '回复')}`].filter(Boolean).join(' · '), {
        id: tp.id,
        slug: null,
        status: tp.status,
      }),
    ),
  }
}

async function searchTag(q: string): Promise<SearchOutcome> {
  const keys = await api.listTagKeys()
  const lq = q.trim().toLowerCase()
  const rows: EntityPick[] = []
  for (const k of keys) {
    for (const v of k.values) {
      const label = `${k.key}: ${v.value}`
      if (
        lq &&
        !(
          label.toLowerCase().includes(lq) ||
          (v.description || '').toLowerCase().includes(lq) ||
          (k.label || k.key).toLowerCase().includes(lq) ||
          (v.group || '').toLowerCase().includes(lq)
        )
      ) {
        continue
      }
      rows.push(
        n(label, [(v.description || '').slice(0, 40), `${v.demo_count} ${t('entityPicker.works', '{n} 件', { n: v.demo_count })}`].filter(Boolean).join(' · '), {
          id: v.id ?? null,
          slug: null,
          status: (v as { status?: string }).status || 'active',
          group: v.group ?? null,
        }),
      )
      if (rows.length >= 50) break
    }
    if (rows.length >= 50) break
  }
  return { rows, total: rows.length }
}

/** 统一搜索入口：kind → 数据源 → 归一化行 */
export async function searchEntities(
  kind: PickerKind,
  q: string,
  source: PickerSource = 'admin',
): Promise<SearchOutcome> {
  switch (normalizeKind(kind)) {
    case 'demo':
      return searchDemo(q)
    case 'model':
      return searchModel(q, source)
    case 'task':
      return searchTask(q, source)
    case 'topic':
      return searchTopic(q)
    case 'tag':
      return searchTag(q)
    default:
      return { rows: [], total: 0 }
  }
}
