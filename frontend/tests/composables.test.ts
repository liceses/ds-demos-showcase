// RF-1 安全网：可复用状态层（composables）单测。
// 这两个 composable 正好是 RF-2 修掉的两个真 bug 的所在地：
//   · useLocalPagination：筛选后条目变少时页码必须夹回范围内（否则表格全白且无法自救）
//   · useBodyScrollLock：引用计数式滚动锁（旧的直接读写 body.overflow 会互相清锁）
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useLocalPagination } from '../src/composables/useLocalPagination'
import { useDebouncedFetch } from '../src/composables/useDebouncedFetch'
import { bodyScrollLockCount, lockBodyScroll, unlockBodyScroll } from '../src/composables/useBodyScrollLock'

describe('useLocalPagination', () => {
  it('按页大小切片，pages 向上取整', () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    const { paged, total, pages } = useLocalPagination(() => items, 4)
    expect(total.value).toBe(10)
    expect(pages.value).toBe(3)
    expect(paged.value).toEqual([0, 1, 2, 3])
  })

  it('setPage 越界会被夹到 [1, pages]', () => {
    const items = Array.from({ length: 5 }, (_, i) => i)
    const { page, setPage } = useLocalPagination(() => items, 2)
    setPage(99)
    expect(page.value).toBe(3)
    setPage(-3)
    expect(page.value).toBe(1)
  })

  it('RF-2 回归：停在第 2 页时筛选到只剩 2 条，页码自动夹回第 1 页（不再出现空白表体）', async () => {
    const all = ref(Array.from({ length: 20 }, (_, i) => i))
    const { page, setPage, paged, pages } = useLocalPagination(() => all.value, 8)
    setPage(3)
    expect(page.value).toBe(3)
    expect(paged.value.length).toBe(4) // 第 3 页只剩 4 条（16..19）

    all.value = [1, 2] // 模拟筛选后只剩 2 条
    await nextTick()
    expect(pages.value).toBe(1)
    expect(page.value).toBe(1) // ← 修复点：旧实现会停在 3，paged 为空
    expect(paged.value).toEqual([1, 2])
  })

  it('空列表时 pages 至少为 1（分页条不消失成 0）', () => {
    const { pages, paged } = useLocalPagination<number>(() => [], 8)
    expect(pages.value).toBe(1)
    expect(paged.value).toEqual([])
  })
})

describe('useBodyScrollLock：引用计数式全局滚动锁', () => {
  beforeEach(() => {
    // 只在调用前局部 stub：全局装 document 会让 Vue runtime-dom 在 import 期炸
    vi.stubGlobal('document', { body: { style: { overflow: 'auto' } } })
  })
  afterEach(() => {
    // 顺序要紧：**先**在 document 还在的时候把计数清零，再还原 stub。
    // 反过来的话 unlockBodyScroll 会因为「无 document」直接 return，
    // 下面的循环永远退不出去（曾把整个测试进程挂死）。
    let guard = 0
    while (bodyScrollLockCount() > 0 && guard++ < 10) unlockBodyScroll()
    vi.unstubAllGlobals()
  })

  it('首次加锁保存原值并置 hidden', () => {
    lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('第二个持有者释放时不会解掉第一个的锁（RF-2 核心：不再互踩）', () => {
    lockBodyScroll() // 搜索覆盖层
    lockBodyScroll() // 全屏 iframe
    expect(bodyScrollLockCount()).toBe(2)

    unlockBodyScroll() // 全屏 iframe 卸载
    expect(bodyScrollLockCount()).toBe(1)
    expect(document.body.style.overflow).toBe('hidden') // ← 旧实现这里会被清成 ''

    unlockBodyScroll()
    expect(bodyScrollLockCount()).toBe(0)
    expect(document.body.style.overflow).toBe('auto') // 还原到最初的值
  })

  it('多余的 unlock 不会把计数压成负数、也不会误还原', () => {
    unlockBodyScroll()
    expect(bodyScrollLockCount()).toBe(0)
    lockBodyScroll()
    unlockBodyScroll()
    unlockBodyScroll()
    expect(bodyScrollLockCount()).toBe(0)
  })
})

describe('useDebouncedFetch：竞态守卫（RF-3 修掉的三处串台 bug 的核心断言）', () => {
  it('慢的旧响应后到时被丢弃，不覆盖新结果', async () => {
    vi.useFakeTimers()
    const query = ref('')
    const resolvers: ((v: string) => void)[] = []
    const { result } = useDebouncedFetch<string>({
      source: () => query.value,
      fetcher: (k) => new Promise<string>((resolve) => resolvers.push(() => resolve(`result:${k}`))),
      delay: 100,
      empty: () => '',
    })

    query.value = 'first'
    await vi.advanceTimersByTimeAsync(120) // 第一次请求发出（未返回）
    query.value = 'second'
    await vi.advanceTimersByTimeAsync(120) // 第二次请求发出（未返回）
    expect(resolvers).toHaveLength(2)

    resolvers[1]() // 后发的先回
    await Promise.resolve()
    await nextTick()
    expect(result.value).toBe('result:second')

    resolvers[0]() // 先发的后回 —— 无守卫时这里会把界面写回 first
    await Promise.resolve()
    await nextTick()
    expect(result.value).toBe('result:second')

    vi.useRealTimers()
  })

  it('输入短于 minLength 时不发请求并清空结果', async () => {
    vi.useFakeTimers()
    const query = ref('a')
    let calls = 0
    const { result } = useDebouncedFetch<string>({
      source: () => query.value,
      fetcher: async (k) => {
        calls++
        return `r:${k}`
      },
      delay: 50,
      minLength: 3,
      empty: () => '',
    })
    await vi.advanceTimersByTimeAsync(80)
    expect(calls).toBe(0)
    expect(result.value).toBe('')
    vi.useRealTimers()
  })
})
