// 沉浸式 chrome 状态机的单测（node 环境，用 vitest 假定时器）
//
// 背景：用户报"全屏时站点有组件压在 demo 上""独立页 3 个按钮还遮住提示条"。
// 重设计后的约定：chrome 只在刚进入/刚被唤出时展开，随后收起为常驻锚点；
// 指针停在 chrome 上时**暂停计时**（否则会出现"正在点按钮时它自己收起"）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImmersiveChrome } from '../src/composables/useImmersiveChrome'

describe('useImmersiveChrome（沉浸式 chrome）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('刚进入是展开态', () => {
    const c = useImmersiveChrome({ delay: 2500 })
    expect(c.awake.value).toBe(true)
  })

  it('到期自动收起为锚点形态', () => {
    const c = useImmersiveChrome({ delay: 2500 })
    vi.advanceTimersByTime(2499)
    expect(c.awake.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(c.awake.value).toBe(false)
  })

  it('poke() 重新展开并重新计时', () => {
    const c = useImmersiveChrome({ delay: 2500 })
    vi.advanceTimersByTime(2000)
    c.poke()
    expect(c.awake.value).toBe(true)
    vi.advanceTimersByTime(2000) // 距上次 poke 只过 2000
    expect(c.awake.value).toBe(true)
    vi.advanceTimersByTime(500)
    expect(c.awake.value).toBe(false)
  })

  it('sleep() 立即收起且不再计时', () => {
    const c = useImmersiveChrome({ delay: 1000 })
    c.sleep()
    expect(c.awake.value).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(c.awake.value).toBe(false)
  })

  it('反复 poke() 不叠加计时器（只按最后一次计时收起）', () => {
    const c = useImmersiveChrome({ delay: 1000 })
    c.poke()
    vi.advanceTimersByTime(800)
    c.poke()
    vi.advanceTimersByTime(800)
    c.poke()
    vi.advanceTimersByTime(999)
    expect(c.awake.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(c.awake.value).toBe(false)
  })

  it('组件外可调用（无组件实例时不注册卸载钩子也不告警）', () => {
    expect(() => useImmersiveChrome()).not.toThrow()
  })
})
