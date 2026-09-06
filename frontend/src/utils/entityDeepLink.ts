// 管理员消化待办后的实体深链（C：队列只消化，改字段回实体页）。
// 并语义不并表：TagValueSuggestion / EntitySuggestion 仍走各自端点，只在查询串上收敛到同一实体详情。

import type { SuggestionItem, TagSuggestion } from '../api/types'

export type AdminEntityQuery = { tab: 'entities'; type: 'model' | 'task' | 'tag'; id: string; key?: string }

export type EntityHref =
  | { kind: 'admin'; query: AdminEntityQuery }
  | { kind: 'demo'; slug: string }

export function adminEntityQuery(type: 'model' | 'task' | 'tag', id: string, key?: string): AdminEntityQuery {
  const q: AdminEntityQuery = { tab: 'entities', type, id }
  if (key) q.key = key
  return q
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function payloadOf(s: SuggestionItem): Record<string, unknown> {
  return s.payload && typeof s.payload === 'object' ? s.payload : {}
}

/** `模型 Foo → slug` / `题目 slug 挂 N 个作品` */
export function parseApproveIdent(result: string | undefined, kind: 'model' | 'task'): string {
  const raw = (result || '').trim()
  if (!raw) return ''
  if (kind === 'model') {
    const m = raw.match(/→\s*(\S+)/)
    return m ? m[1] : ''
  }
  const m = raw.match(/^题目\s+(\S+)/)
  return m ? m[1] : ''
}

export function suggestionEntityHref(s: SuggestionItem): EntityHref | null {
  const p = payloadOf(s)
  switch (s.kind) {
    case 'new_model': {
      const ident = str(p.slug) || parseApproveIdent(s.result, 'model')
      return ident ? { kind: 'admin', query: adminEntityQuery('model', ident) } : null
    }
    case 'alias': {
      const ident = str(p.model_id || p.slug || s.ref_id)
      return ident ? { kind: 'admin', query: adminEntityQuery('model', ident) } : null
    }
    case 'merge_model': {
      const ident = str(p.target_id || p.target_slug || p.slug)
      return ident ? { kind: 'admin', query: adminEntityQuery('model', ident) } : null
    }
    case 'new_task': {
      const ident = str(p.task_id || p.slug) || parseApproveIdent(s.result, 'task')
      return ident ? { kind: 'admin', query: adminEntityQuery('task', ident) } : null
    }
    case 'task_match': {
      const ident = str(p.task_id || p.task_slug || s.ref_id)
      return ident ? { kind: 'admin', query: adminEntityQuery('task', ident) } : null
    }
    case 'merge_task': {
      const ident = str(p.target_id || p.target_slug || p.task_id)
      return ident ? { kind: 'admin', query: adminEntityQuery('task', ident) } : null
    }
    case 'retag_demo': {
      const slug = str(p.demo_slug)
      return slug ? { kind: 'demo', slug } : null
    }
    default:
      return null
  }
}

export function tagSuggestionEntityQuery(s: Pick<TagSuggestion, 'key' | 'value'>, tagId?: number | null): AdminEntityQuery | null {
  if (tagId == null || !Number.isFinite(Number(tagId))) return null
  return adminEntityQuery('tag', String(tagId), s.key)
}

export function entityHrefTo(h: EntityHref): { path: string; query?: Record<string, string> } {
  if (h.kind === 'demo') return { path: `/demo/${h.slug}` }
  const query: Record<string, string> = { tab: h.query.tab, type: h.query.type, id: h.query.id }
  if (h.query.key) query.key = h.query.key
  return { path: '/admin', query }
}

/** 写回 tags 时丢掉系统保留键（author / version-of 由服务端重挂） */
export const RESERVED_TAG_KEYS = new Set(['author', 'version-of'])

export function tagsForWrite(tags: { key: string; value: string }[]): string[] {
  return tags.filter((t) => !RESERVED_TAG_KEYS.has(t.key)).map((t) => `${t.key}:${t.value}`)
}
