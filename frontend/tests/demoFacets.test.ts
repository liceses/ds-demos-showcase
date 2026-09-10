// RF-4d：作品库筛选抽屉的纯函数层单测。
//
// 这些函数原先内联在 DemosView 的 setup 里，而该视图需要 localStorage / matchMedia /
// IntersectionObserver / vue-router 四件外部依赖才能挂载 —— 逻辑**原本一行都测不到**。
// 下沉到 utils/demoFacets 后可直接断言（尤其是「保底三档只在无后端范围时兜」这条口径）。
import { describe, expect, it } from 'vitest'
import { chipLabel, intBounds, intBoundsOf, quickPresets, vendorDot } from '../src/utils/demoFacets'

function vals(...vs: string[]) {
  return vs.map((value) => ({ value }))
}

describe('intBoundsOf：数值键取值范围', () => {
  it('后端给了 min/max 就用它，即使只剩一档也不额外撑开', () => {
    // min=max=3 的真实数据不该长出「5+」这种超数据档位
    expect(intBoundsOf(3, 3, [])).toEqual({ lo: 3, hi: 3 })
  })

  it('后端没给范围时从实际值取最小/最大', () => {
    expect(intBoundsOf(null, null, vals('2', '9', '5'))).toEqual({ lo: 2, hi: 9 })
  })

  it('无范围且只有一个值：保底留出 lo+2（够画三档）', () => {
    expect(intBoundsOf(null, null, vals('3'))).toEqual({ lo: 3, hi: 5 })
  })

  it('无范围且没有值：回落 0..8', () => {
    expect(intBoundsOf(null, null, [])).toEqual({ lo: 0, hi: 8 })
  })

  it('非数字值被忽略（不产生 NaN 边界）', () => {
    const r = intBoundsOf(null, null, vals('abc', '4'))
    expect(r).toEqual({ lo: 4, hi: 6 })
  })

  it('intBounds 从分面组上取字段', () => {
    expect(intBounds({ key: 'rounds', min: 1, max: 10, values: [] })).toEqual({ lo: 1, hi: 10 })
  })
})

describe('quickPresets：三分位快捷档', () => {
  it('跨度不足 3 档时不给档位', () => {
    expect(quickPresets({ key: 'rounds', min: 1, max: 2, values: [] })).toEqual([])
  })

  it('跨度 9 → 三段（末档开放 N+）', () => {
    const ps = quickPresets({ key: 'rounds', min: 1, max: 9, values: [] })
    expect(ps).toEqual([
      { label: '1-3', lo: 1, hi: 3 },
      { label: '4-6', lo: 4, hi: 6 },
      { label: '7+', lo: 7, hi: 9 },
    ])
  })

  it('刚好能切两段时只给到第二段', () => {
    const ps = quickPresets({ key: 'x', min: 1, max: 5, values: [] })
    expect(ps.length).toBeGreaterThan(0)
    expect(ps[0].lo).toBe(1)
    expect(ps[ps.length - 1].hi).toBe(5)
  })

  it('每档 lo<=hi（不产生空区间）', () => {
    for (const span of [3, 4, 7, 12, 31]) {
      const ps = quickPresets({ key: 'k', min: 0, max: span - 1, values: [] })
      for (const p of ps) expect(p.lo).toBeLessThanOrEqual(p.hi)
    }
  })
})

describe('chipLabel：已选条件摘要', () => {
  it('数值范围走「key lo-hi」空格形（不用冒号）', () => {
    expect(chipLabel('rounds:3-5')).toBe('rounds 3-5')
    expect(chipLabel('rounds:7')).toBe('rounds 7')
  })

  it('负起点范围能识别；负终点不行（既有正则口径，本次重构未改变）', () => {
    // 如实记录现状，避免以后误以为"负数范围都支持"：
    // 正则 /^-?\d+(-\d+)?$/ 认「-3-5」（负起点+正终点），不认「-3--1」（终点也是负）。
    // 本产品数值键（rounds/minutes/platform…）都非负，故未扩正则。
    expect(chipLabel('delta:-3-5')).toBe('delta -3-5')
    expect(chipLabel('delta:-3--1')).toBe('delta:-3--1')
  })

  it('非数值条件交给 tagStrLabel（整活模式联动），不返回空', () => {
    expect(typeof chipLabel('model:dsv4-flash')).toBe('string')
    expect(chipLabel('model:dsv4-flash').length).toBeGreaterThan(0)
  })

  it('没有冒号的裸串也不崩', () => {
    expect(typeof chipLabel('sometag')).toBe('string')
  })
})

describe('vendorDot：厂商分组点颜色', () => {
  it('已知厂商给语义色，未知给灰', () => {
    expect(vendorDot('DeepSeek')).toBe('var(--teal)')
    expect(vendorDot('OpenAI')).toBe('var(--ink)')
    expect(vendorDot('不存在的厂商')).toBe('#999')
  })
})
