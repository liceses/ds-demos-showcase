// RF-4e：作品库筛选层单测（useDemoFilters）。
//
// 这层原来内联在 1112 行的 DemosView 里，与 localStorage / IntersectionObserver /
// matchMedia 绑在一起 —— 逻辑一行都测不到。抽成合成器后，最要紧的那个不变量
// （**自家写 URL 不能再当成一次新导航**）可以在这里直接钉住：
// 它坏了的表现是「每次筛选都查两次」，而 RF-4a 修的「筛选不刷新」正是同一族的根因。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// 用**响应式**假 route + 记录型 router 顶掉 vue-router（合成器只用到这两个 API）。
// 必须响应式：否则合成器里的 watch 跟踪不到 query 变化，测不出「自家写入不触发重查」。
const mockRouter = vi.hoisted(() => ({ replaced: [] as Record<string, string>[] }))

vi.mock('vue-router', async () => {
  const { ref } = await import('vue')
  const query = ref<Record<string, string>>({})
  return {
    __query: query,
    useRoute: () => ({
      get query() {
        return query.value
      },
    }),
    useRouter: () => ({
      replace: (arg: { query: Record<string, string> }) => {
        mockRouter.replaced.push(arg.query)
        query.value = { ...arg.query } // 模拟真实路由：写完 query 会回流到 route.query
        return Promise.resolve()
      },
    }),
  }
})

import { useDemoFilters } from '../src/composables/useDemoFilters'
import { __query as queryRef } from 'vue-router'

const replaced = mockRouter.replaced

/** 直接改「浏览器地址栏」：模拟外部导航 */
function setQuery(q: Record<string, string>) {
  ;(queryRef as unknown as { value: Record<string, string> }).value = q
}

beforeEach(() => {
  ;(queryRef as unknown as { value: Record<string, string> }).value = {}
  replaced.length = 0
  localStorage.clear()
})

describe('useDemoFilters：状态 → URL', () => {
  it('syncQuery 只写非默认项（默认排序不写进 URL）', async () => {
    const f = useDemoFilters({ onChange: () => {} })
    f.selectedTags.value = ['model:dsv4-flash', 'type:demo']
    f.submittedQ.value = '粒子'
    f.modelFilter.value = 'dsv4-pro'
    f.syncQuery()
    await nextTick()
    expect(replaced[0]).toEqual({ q: '粒子', tag: 'model:dsv4-flash,type:demo', model: 'dsv4-pro' })
  })

  it('排序为默认 newest 时不写 sort', async () => {
    const f = useDemoFilters({ onChange: () => {} })
    f.syncQuery()
    await nextTick()
    expect(replaced[0]).toEqual({})
  })

  it('apply() 一次做完两件事：触发重查 + 写 URL', async () => {
    const onChange = vi.fn()
    const f = useDemoFilters({ onChange })
    f.selectedTags.value = ['type:demo']
    f.apply()
    await nextTick()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(replaced[0]).toEqual({ tag: 'type:demo' })
  })
})

describe('useDemoFilters：URL → 状态（幂等是核心）', () => {
  it('URL 与状态一致时返回 false —— 自家写入不被当成新导航（否则每次筛选查两次）', () => {
    const f = useDemoFilters({ onChange: () => {} })
    f.selectedTags.value = ['type:demo']
    f.submittedQ.value = 'x'
    setQuery({ tag: 'type:demo', q: 'x' })
    expect(f.applyRouteQuery()).toBe(false)
  })

  it('URL 真变化时返回 true 并还原状态（含标签数组与排序）', () => {
    const f = useDemoFilters({ onChange: () => {} })
    setQuery({ tag: 'type:demo,model:dsv4-flash', model: 'dsv4-pro', sort: 'popular', q: '粒子' })
    expect(f.applyRouteQuery()).toBe(true)
    expect(f.selectedTags.value).toEqual(['type:demo', 'model:dsv4-flash'])
    expect(f.modelFilter.value).toBe('dsv4-pro')
    expect(f.sort.value).toBe('popular')
    expect(f.q.value).toBe('粒子')
    expect(f.submittedQ.value).toBe('粒子')
  })

  it('排序值非法（如 sort=weird）时回落当前排序，不崩', () => {
    const f = useDemoFilters({ onChange: () => {} })
    setQuery({ sort: 'weird' })
    expect(f.sort.value).toBe('newest')
  })

  it('路由 watch：只有 URL 真变化才触发重查（自家写入自愈）', async () => {
    const onChange = vi.fn()
    useDemoFilters({ onChange })
    // 模拟「本页写了 URL」：route.query 被 router.replace 回流
    setQuery({ tag: 'type:demo' })
    await nextTick()
    expect(onChange).toHaveBeenCalledTimes(1) // 外部变化 → 重查一次
    await nextTick()
    expect(onChange).toHaveBeenCalledTimes(1) // 幂等：不再重复触发
  })
})

describe('useDemoFilters：卡片模式与范围初始化', () => {
  it('setCardMode 落 localStorage 并触发重查；同值重复设置不触发', () => {
    const onChange = vi.fn()
    const f = useDemoFilters({ onChange })
    f.setCardMode('prompt')
    expect(f.cardMode.value).toBe('prompt')
    expect(localStorage.getItem('ds_card_mode')).toBe('prompt')
    expect(onChange).toHaveBeenCalledTimes(1)
    f.setCardMode('prompt')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('initIntRanges 只给 int 键且不覆盖已有范围', () => {
    const f = useDemoFilters({ onChange: () => {} })
    const boundsOf = () => ({ lo: 1, hi: 9 })
    f.intRange.value = { rounds: { lo: 2, hi: 4 } }
    f.initIntRanges(
      [
        { key: 'rounds', mode: 'int', min: 1, max: 9, values: [] },
        { key: 'type', mode: 'fixed', min: null, max: null, values: [] },
      ],
      boundsOf,
    )
    expect(f.intRange.value.rounds).toEqual({ lo: 2, hi: 4 }) // 不覆盖
    expect(f.intRange.value.type).toBeUndefined() // fixed 键不初始化
  })

  it('facetCount 口径 = 标签数 + 模型实体（与按钮文案同源）', () => {
    const f = useDemoFilters({ onChange: () => {} })
    expect(f.facetCount.value).toBe(0)
    f.selectedTags.value = ['type:demo']
    expect(f.facetCount.value).toBe(1)
    f.modelFilter.value = 'dsv4-flash'
    expect(f.facetCount.value).toBe(2)
  })
})
