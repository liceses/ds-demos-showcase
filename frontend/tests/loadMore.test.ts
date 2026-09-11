// P2-d：useLoadMore 单测（纯逻辑，零 DOM）
import { describe, expect, it, vi } from 'vitest'
import { useLoadMore } from '../src/composables/useLoadMore'

function paged(total: number, _size: number) {
  return vi.fn(async ({ page, page_size }: { page: number; page_size: number }) => {
    const start = (page - 1) * page_size
    const items = Array.from({ length: Math.max(0, Math.min(page_size, total - start)) }, (_, i) => start + i)
    return { items, total }
  })
}

describe('useLoadMore', () => {
  it('首页加载取第 1 页，并记住 total', async () => {
    const f = paged(50, 24)
    const lm = useLoadMore<number>(f, 24)
    await lm.loadFirst()
    expect(f).toHaveBeenCalledWith({ page: 1, page_size: 24 })
    expect(lm.items.value.length).toBe(24)
    expect(lm.total.value).toBe(50)
    expect(lm.hasMore.value).toBe(true)
  })

  it('loadMore 追加而不是替换（这正是原先 3 个页面丢掉的行为）', async () => {
    const f = paged(50, 24)
    const lm = useLoadMore<number>(f, 24)
    await lm.loadFirst()
    await lm.loadMore()
    expect(lm.items.value.length).toBe(48)
    expect(lm.items.value[0]).toBe(0) // 第一页还在
    expect(lm.items.value[47]).toBe(47)
    await lm.loadMore()
    expect(lm.items.value.length).toBe(50) // 末尾不足一页
    expect(lm.hasMore.value).toBe(false)
  })

  it('拿满后不再空转请求（hasMore=false 时 loadMore 直接返回）', async () => {
    const f = paged(10, 10)
    const lm = useLoadMore<number>(f, 10)
    await lm.loadFirst()
    expect(lm.hasMore.value).toBe(false)
    const calls = f.mock.calls.length
    await lm.loadMore()
    expect(f.mock.calls.length).toBe(calls) // 没有第 2 次请求
  })

  it('并发保护：加载中重复调用不会重复请求（按钮 disabled 之外再兜一层）', async () => {
    let resolveFn: (() => void) | null = null
    const f = vi.fn(async () => {
      await new Promise<void>((r) => { resolveFn = r })
      return { items: [1], total: 5 }
    })
    const lm = useLoadMore<number>(f, 1)
    const p1 = lm.loadFirst()
    const p2 = lm.loadMore() // 第一次还没回来
    resolveFn?.()
    await Promise.all([p1, p2])
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('失败要落在 error 上且不吞掉已有数据；重试后清空 error', async () => {
    let boom = true
    const f = vi.fn(async ({ page }: { page: number; page_size: number }) => {
      if (boom) throw new Error('网络炸了')
      return { items: [page], total: 1 }
    })
    const lm = useLoadMore<number>(f, 1)
    await lm.loadFirst()
    expect(lm.error.value).toBe('网络炸了')
    expect(lm.items.value).toEqual([])
    boom = false
    await lm.loadFirst()
    expect(lm.error.value).toBe('')
    expect(lm.items.value).toEqual([1])
  })

  it('loadFirst 是重置（换筛选条件后不会把新旧结果拼在一起）', async () => {
    const f = paged(100, 24)
    const lm = useLoadMore<number>(f, 24)
    await lm.loadFirst()
    await lm.loadMore()
    expect(lm.items.value.length).toBe(48)
    await lm.loadFirst()
    expect(lm.items.value.length).toBe(24)
    expect(lm.page.value).toBe(1)
  })
})
