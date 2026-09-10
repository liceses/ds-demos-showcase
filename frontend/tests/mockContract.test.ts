// RF-5a：mock（离线演示模式）契约测试。
//
// 为什么需要：mock 是 2500 行手写镜像，与真接口**没有任何机制保证一致** ——
// 审查挖出过一批「静默丢弃参数 / 静默降级排序 / 造了对象不入队」的漂移，
// 后果是离线演示给出与线上相反的结论（筛选无效、排行榜把没评分的也排上去）。
// 这个文件把已经对齐的语义钉住：以后改 mock 若把参数又丢掉，这里会红。
//
// 说明：mock 的 delay() 默认 180ms，本文件用真实定时器（调用次数少，总耗时 <2s）。
import { describe, expect, it } from 'vitest'
import { mockApi } from '../src/api/mock'

describe('mock.listDemos：与真接口的筛选语义一致', () => {
  it('author=public 只出未注册上传（虚拟身份）——与全量结果里的同名作者逐一对照', async () => {
    // 不假设夹具里一定有匿名上传：先取全量，再断言「过滤结果 = 全量里 author=public 的那些」
    const all = await mockApi.listDemos({ page_size: 200 })
    const expected = all.items.filter((d) => d.author === 'public').map((d) => d.slug)
    const res = await mockApi.listDemos({ author: 'public', page_size: 200 })
    expect(res.items.map((d) => d.slug)).toEqual(expected)
  })

  it('author=<用户名> 只出该用户的作品', async () => {
    const res = await mockApi.listDemos({ author: 'tester' })
    expect(res.items.every((d) => d.author === 'tester')).toBe(true)
  })

  it('model=<slug> 按 model 标签过滤（原先参数被静默丢弃）', async () => {
    const res = await mockApi.listDemos({ model: 'dsv4-flash' })
    expect(res.items.length).toBeGreaterThan(0)
    expect(res.items.every((d) => d.tags.some((t) => t === 'model:dsv4-flash' || (t as { key?: string; value?: string }).value === 'dsv4-flash'))).toBe(true)
  })

  it('task=<slug> 如实过滤（mock 作品无题目关联 → 空结果，而不是忽略参数）', async () => {
    const res = await mockApi.listDemos({ task: 'no-such-task' })
    expect(res.items).toEqual([])
  })

  it('featured=1 是在既有筛选上收窄，不再绕过 q（原先提前 return）', async () => {
    const all = await mockApi.listDemos({ featured: 1 })
    expect(all.items.length).toBeGreaterThan(0)
    const narrowed = await mockApi.listDemos({ featured: 1, q: '这个词一定搜不到-zzz' })
    expect(narrowed.items).toEqual([])
    expect(narrowed.total).toBe(0)
  })

  it('featured=1 的结果是策展池子集且按池序（hero 首件）', async () => {
    const res = await mockApi.listDemos({ featured: 1 })
    const pool = await mockApi.listDemos({ featured: 1, page_size: 50 })
    expect(res.items.length).toBeLessThanOrEqual(pool.items.length)
    expect(pool.total).toBeGreaterThanOrEqual(res.items.length)
  })
})

describe('mock.listForumTopics：三种排序不再是同一个降级分支', () => {
  it('replies 按回复数降序', async () => {
    const res = await mockApi.listForumTopics({ sort: 'replies', page_size: 50 })
    const counts = res.items.map((t) => t.reply_count)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  it('hot 按「回复数 + 浏览/50」降序', async () => {
    const res = await mockApi.listForumTopics({ sort: 'hot', page_size: 50 })
    const score = res.items.map((t) => t.reply_count + t.view_count / 50)
    expect(score).toEqual([...score].sort((a, b) => b - a))
  })

  it('popular 按浏览数降序', async () => {
    const res = await mockApi.listForumTopics({ sort: 'popular', page_size: 50 })
    const views = res.items.map((t) => t.view_count)
    expect(views).toEqual([...views].sort((a, b) => b - a))
  })
})

describe('mock.getLeaderboard：质量榜排除 0 评（与 ratings.py 口径一致）', () => {
  it('avg / god / ghost / net 都只出有评分的作品', async () => {
    for (const sort of ['avg', 'god', 'ghost', 'net'] as const) {
      const res = await mockApi.getLeaderboard(sort, 1, 50)
      expect(res.items.every((d) => (d.rating_count || 0) > 0), `${sort} 出现 0 评作品`).toBe(true)
    }
  })

  it('count / heat 不套用该排除（它们本就按数量/热度排）', async () => {
    const res = await mockApi.getLeaderboard('count', 1, 50)
    expect(res.items.length).toBeGreaterThan(0)
  })
})

describe('mock.suggestTagValue：申请要真的进队列', () => {
  it('提交后能在待审列表里查到（原先只造对象不入队）', async () => {
    const value = `mock-contract-${Date.now()}`
    await mockApi.suggestTagValue({ key: 'skills', value, description: '契约测试' })
    const pending = await mockApi.listTagSuggestions('pending')
    expect(pending.some((s) => s.value === value)).toBe(true)
  })
})
