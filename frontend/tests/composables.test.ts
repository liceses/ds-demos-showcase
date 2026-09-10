// RF-1 安全网：可复用状态层（composables）单测。
// 这两个 composable 正好是 RF-2 修掉的两个真 bug 的所在地：
//   · useLocalPagination：筛选后条目变少时页码必须夹回范围内（否则表格全白且无法自救）
//   · useBodyScrollLock：引用计数式滚动锁（旧的直接读写 body.overflow 会互相清锁）
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useLocalPagination } from '../src/composables/useLocalPagination'
import { useDebouncedFetch } from '../src/composables/useDebouncedFetch'
import { useSelectedTags } from '../src/composables/useSelectedTags'
import { useLoadGeneration } from '../src/composables/useLoadGeneration'
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

describe('useSelectedTags：已选标签的派生（RF-3c 收敛的四处展平）', () => {
  it('展平成带 key 的行，count 与 tags 串同源', () => {
    const selected = ref({
      model: [{ value: 'dsv4-flash', description: '' }],
      type: [{ value: 'demo', description: '' }, { value: 'game', description: '' }],
    })
    const { list, count, tags, modelNames, valuesOf } = useSelectedTags(selected)
    expect(count.value).toBe(3)
    expect(list.value.map((r) => `${r.key}:${r.value}`)).toEqual(['model:dsv4-flash', 'type:demo', 'type:game'])
    expect(tags.value).toEqual(['model:dsv4-flash', 'type:demo', 'type:game'])
    expect(modelNames.value).toEqual(['dsv4-flash'])
    expect(valuesOf('type')).toEqual(['demo', 'game'])
    expect(valuesOf('nope')).toEqual([])
  })

  it('has 判定按 key 限定（不同 key 的同名值不互相命中）', () => {
    const selected = ref({ model: [{ value: 'demo' }], type: [{ value: 'demo' }] })
    const { has } = useSelectedTags(selected)
    expect(has('type', 'demo')).toBe(true)
    expect(has('model', 'demo')).toBe(true)
    expect(has('preset', 'demo')).toBe(false)
  })

  it('toMap 与 list 往返一致（v-model setter 依赖这个不变量）', () => {
    const selected = ref({ model: [{ value: 'a', description: 'x' }] })
    const { list, toMap } = useSelectedTags(selected)
    const back = toMap(list.value)
    expect(back).toEqual({ model: [{ value: 'a', description: 'x' }] })
  })

  it('空 map 不报错（派生值都为空）', () => {
    const { list, count, tags, modelNames } = useSelectedTags(ref({}))
    expect([list.value, tags.value, modelNames.value]).toEqual([[], [], []])
    expect(count.value).toBe(0)
  })
})

describe('useLoadGeneration：世代号守卫（RF-4a 修掉 DemosView 筛选不刷新的核心不变量）', () => {
  it('只有最新世代的请求可以写结果', () => {
    const gen = useLoadGeneration()
    const a = gen.next()
    const b = gen.next()
    expect(gen.isCurrent(a)).toBe(false)
    expect(gen.isCurrent(b)).toBe(true)
  })

  it('invalidate 作废所有在途请求（换筛选时不必等旧请求返回）', () => {
    const gen = useLoadGeneration()
    const inflight = gen.next()
    expect(gen.isCurrent(inflight)).toBe(true)
    gen.invalidate()
    expect(gen.isCurrent(inflight)).toBe(false)
    // 紧接着发起的新请求是新世代，允许写
    const fresh = gen.next()
    expect(gen.isCurrent(fresh)).toBe(true)
  })

  it('模拟真实时序：首屏加载中换筛选 → 旧响应被丢弃，新响应胜出', async () => {
    const gen = useLoadGeneration()
    let rendered: string[] = []
    let inflight = 'old'

    async function load(label: string, delayMs: number) {
      const my = gen.next()
      inflight = label
      await new Promise((r) => setTimeout(r, delayMs))
      if (!gen.isCurrent(my)) return // 守卫
      rendered = [label]
    }

    const first = load('首屏', 30) // 在途
    gen.invalidate() // 用户点标签 → reset()
    const second = load('筛选后', 5)
    await Promise.all([first, second])
    expect(rendered).toEqual(['筛选后']) // 慢的「首屏」后到也没覆盖
    expect(inflight).toBe('筛选后')
  })
})
