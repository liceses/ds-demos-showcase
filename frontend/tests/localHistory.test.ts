// 本机浏览历史 + 混合合并 + 相对时间（纯逻辑，node 环境）
//
// 用户裁决：历史 = **混合**存储 —— 匿名只写本机 localStorage，登录后服务端也记一份，
// 展示时按 slug 合并去重（同作品取更近的一次）。这里钉住合并语义与边界，
// 因为"同一个作品显示两遍"或"本机记录被服务端的旧记录顶掉"都是肉眼很难发现、但很恼人的 bug。
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_HISTORY_KEY, LOCAL_HISTORY_MAX, mergeHistory, useLocalHistory } from '../src/composables/useLocalHistory'
import { dayLabel, groupByDay, relativeTime } from '../src/utils/relTime'
import type { HistoryItemOut } from '../src/api/types'

function demo(slug: string, title = slug): HistoryItemOut['demo'] {
  return {
    slug,
    title,
    description: '',
    cover_url: '',
    author: 'a',
    author_id: 1,
    tags: [],
    models: [],
    view_count: 0,
    download_count: 0,
    comment_count: 0,
    rating_avg: 0,
    rating_count: 0,
    created_at: '2026-01-01T00:00:00Z',
  } as unknown as HistoryItemOut['demo']
}

function serverItem(slug: string, iso: string): HistoryItemOut {
  return { demo: demo(slug), viewed_at: iso }
}

beforeEach(() => {
  localStorage.clear()
})

describe('useLocalHistory（本机历史）', () => {
  it('记录后能读回；同 slug 去重置顶（不产生第二条）', () => {
    const h = useLocalHistory()
    h.record({ slug: 'a', title: 'A', cover_url: '' })
    h.record({ slug: 'b', title: 'B', cover_url: '' })
    h.record({ slug: 'a', title: 'A', cover_url: '' })
    expect(h.items.value.map((x) => x.slug)).toEqual(['a', 'b'])
  })

  it(`上限 ${LOCAL_HISTORY_MAX} 条：超出裁掉最旧的`, () => {
    const h = useLocalHistory()
    for (let i = 0; i < LOCAL_HISTORY_MAX + 5; i++) h.record({ slug: `s${i}`, title: `S${i}`, cover_url: '' })
    expect(h.items.value.length).toBe(LOCAL_HISTORY_MAX)
    expect(h.items.value[0].slug).toBe(`s${LOCAL_HISTORY_MAX + 4}`) // 最新的在最前
  })

  it('脏数据自愈：坏 JSON / 形状不对的行都被忽略，不抛错', () => {
    localStorage.setItem(LOCAL_HISTORY_KEY, '{不是 JSON')
    expect(useLocalHistory().items.value).toEqual([])
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify([{ slug: 'ok', title: 't', cover_url: '', model_labels: [], ts: 1 }, { nope: 1 }, 42]))
    expect(useLocalHistory().items.value.map((x) => x.slug)).toEqual(['ok'])
  })

  it('remove / clear 都能落盘（不是只改了内存）', () => {
    const h = useLocalHistory()
    h.record({ slug: 'a', title: 'A', cover_url: '' })
    h.record({ slug: 'b', title: 'B', cover_url: '' })
    h.remove('a')
    expect(useLocalHistory().items.value.map((x) => x.slug)).toEqual(['b'])
    h.clear()
    expect(localStorage.getItem(LOCAL_HISTORY_KEY)).toBeNull()
    expect(useLocalHistory().items.value).toEqual([])
  })
})

describe('mergeHistory（本机 + 服务端合并）', () => {
  const local = (slug: string, ts: number) => ({ slug, title: slug, cover_url: '', model_labels: [], ts })

  it('同 slug 只出一条，取时间更近的那次', () => {
    const rows = mergeHistory(
      [serverItem('a', '2026-09-10T10:00:00Z')],
      [local('a', new Date('2026-09-11T10:00:00Z').getTime())],
    )
    expect(rows.length).toBe(1)
    expect(rows[0].source).toBe('local') // 本机那次更近
  })

  it('服务端更近时保留服务端那条（本机旧记录不顶掉新的）', () => {
    const rows = mergeHistory(
      [serverItem('a', '2026-09-12T10:00:00Z')],
      [local('a', new Date('2026-09-11T10:00:00Z').getTime())],
    )
    expect(rows[0].source).toBe('server')
    expect(rows[0].viewed_at).toBe('2026-09-12T10:00:00Z')
  })

  it('两边不同的作品都保留，并按时间倒序', () => {
    const rows = mergeHistory(
      [serverItem('s', '2026-09-10T10:00:00Z')],
      [local('l', new Date('2026-09-11T10:00:00Z').getTime())],
    )
    expect(rows.map((r) => r.slug)).toEqual(['l', 's'])
  })

  it('limit 生效（首页区块只要最近 N 条）', () => {
    const rows = mergeHistory(
      [serverItem('a', '2026-09-10T10:00:00Z'), serverItem('b', '2026-09-09T10:00:00Z')],
      [],
      1,
    )
    expect(rows.length).toBe(1)
    expect(rows[0].slug).toBe('a')
  })

  it('匿名（服务端为空）也能正常出本机记录', () => {
    const rows = mergeHistory([], [local('l', Date.now())])
    expect(rows.length).toBe(1)
    expect(rows[0].source).toBe('local')
  })
})

describe('相对时间与分组（历史页口径）', () => {
  const now = new Date('2026-09-11T12:00:00').getTime()

  it('刚刚 / 分钟 / 小时 / 昨天 / 更早 五档', () => {
    expect(relativeTime(new Date(now - 30_000).toISOString(), now)).toBe('刚刚')
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 分钟前')
    expect(relativeTime(new Date(now - 3 * 3600_000).toISOString(), now)).toBe('3 小时前')
    expect(relativeTime(new Date('2026-09-10T15:30:00').toISOString(), now)).toMatch(/^昨天 /)
    expect(relativeTime(new Date('2026-09-01T08:00:00').toISOString(), now)).toBe('9月1日')
  })

  it('分组标题：今天 / 昨天 / M月D日', () => {
    expect(dayLabel(new Date(now).toISOString(), now)).toBe('今天')
    expect(dayLabel(new Date('2026-09-10T09:00:00').toISOString(), now)).toBe('昨天')
    expect(dayLabel(new Date('2026-09-02T09:00:00').toISOString(), now)).toBe('9月2日')
  })

  it('groupByDay 把相邻同一天的合到一组（输入已按时间倒序）', () => {
    const rows = [
      { viewed_at: new Date(now).toISOString() },
      { viewed_at: new Date(now - 3600_000).toISOString() },
      { viewed_at: new Date('2026-09-10T09:00:00').toISOString() },
    ]
    const g = groupByDay(rows, now)
    expect(g.map((x) => x.label)).toEqual(['今天', '昨天'])
    expect(g[0].rows.length).toBe(2)
  })
})
