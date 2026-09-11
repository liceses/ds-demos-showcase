// RF-4i：分面抽屉**形态层**单测。
//
// 原先这段（移动/钉住/overlay 三态判定 + 开合 + 钉住记忆 + Esc）内联在 DemosView 的
// 1010 行里，与应用数据、路由、IntersectionObserver 混在一起 —— 判定规则一行都测不到。
// 抽成 useFacetDrawer 后可以直接断言三态与持久化。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFacetDrawer } from '../src/composables/useFacetDrawer'

const PIN_KEY = 'dsh_demos_facet_pin'

function stubMobile(matches: boolean) {
  vi.stubGlobal('window', {
    matchMedia: () => ({
      matches,
      addEventListener() {},
      removeEventListener() {},
    }),
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useFacetDrawer：三态判定', () => {
  it('桌面未钉住 = overlay，初始不显示、打开后才显示且带遮罩', () => {
    const d = useFacetDrawer()
    expect(d.panelMode.value).toBe('overlay')
    expect(d.showPanel.value).toBe(false)
    d.openFacet()
    expect(d.showPanel.value).toBe(true)
    expect(d.backdropActive.value).toBe(true)
    d.closeFacet()
    expect(d.showPanel.value).toBe(false)
    expect(d.backdropActive.value).toBe(false)
  })

  it('钉住态 = 常驻显示且**不**带遮罩（不是浮层）', () => {
    localStorage.setItem(PIN_KEY, '1')
    const d = useFacetDrawer()
    expect(d.panelMode.value).toBe('pinned')
    expect(d.showPanel.value).toBe(true) // 常开，不依赖 facetOpen
    expect(d.backdropActive.value).toBe(false)
  })

  it('移动端 = sheet（钉住记忆被移动端压过：手机上一屏一事）', () => {
    localStorage.setItem(PIN_KEY, '1') // 即便之前钉住过
    stubMobile(true)
    const d = useFacetDrawer()
    expect(d.isMobile.value).toBe(true)
    expect(d.panelMode.value).toBe('sheet')
  })
})

describe('useFacetDrawer：开合与钉住持久化', () => {
  it('toggleFacet 在开/关之间切换', () => {
    const d = useFacetDrawer()
    d.toggleFacet()
    expect(d.showPanel.value).toBe(true)
    d.toggleFacet()
    expect(d.showPanel.value).toBe(false)
  })

  it('pinFacet 关掉浮层并落 localStorage；unpinFacet 反向操作', () => {
    const d = useFacetDrawer()
    d.openFacet()
    d.pinFacet()
    expect(d.facetPinned.value).toBe(true)
    expect(d.facetOpen.value).toBe(false)
    expect(localStorage.getItem(PIN_KEY)).toBe('1')

    d.unpinFacet()
    expect(d.facetPinned.value).toBe(false)
    expect(localStorage.getItem(PIN_KEY)).toBe('0')
  })

  it('localStorage 里是别的值时不当作钉住（只有 "1" 算）', () => {
    localStorage.setItem(PIN_KEY, '0')
    const d = useFacetDrawer()
    expect(d.facetPinned.value).toBe(false)
    expect(d.panelMode.value).toBe('overlay')
  })

  it('openFacet 会调用 onOpen 钩子（视图用它做移动端单组收敛）', () => {
    const calls: string[] = []
    const d = useFacetDrawer({ onOpen: (mode) => calls.push(mode) })
    d.openFacet()
    expect(calls).toEqual(['overlay'])
  })
})
