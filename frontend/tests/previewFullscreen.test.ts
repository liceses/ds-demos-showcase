// 全屏实现的单测（node 环境，靠注入 lock/unlock 避免 DOM 依赖）
//
// 背景：全屏从"原生优先 + 两套降级层"收敛成"站内覆盖层唯一实现"。
// 这里钉住三件容易回归的事：① 开/关幂等 ② 锁成对（RF-2 的教训：无条件解锁会解掉别人的锁）
// ③ 组件外可调用（测试环境没有组件实例）。
import { describe, expect, it, vi } from 'vitest'
import { usePreviewFullscreen } from '../src/composables/usePreviewFullscreen'

function setup() {
  const lock = vi.fn()
  const unlock = vi.fn()
  const fs = usePreviewFullscreen({ lock, unlock })
  return { fs, lock, unlock }
}

describe('usePreviewFullscreen（站内覆盖层唯一实现）', () => {
  it('toggle 进入 → 状态为真，且只加一次锁', () => {
    const { fs, lock, unlock } = setup()
    fs.toggle()
    expect(fs.isFullscreen.value).toBe(true)
    expect(lock).toHaveBeenCalledTimes(1)
    expect(unlock).not.toHaveBeenCalled()
  })

  it('toggle 两次 → 回到初始，且锁成对（一加一解）', () => {
    const { fs, lock, unlock } = setup()
    fs.toggle()
    fs.toggle()
    expect(fs.isFullscreen.value).toBe(false)
    expect(lock).toHaveBeenCalledTimes(1)
    expect(unlock).toHaveBeenCalledTimes(1)
  })

  it('enter 幂等：重复进入不会重复加锁', () => {
    const { fs, lock } = setup()
    fs.enter()
    fs.enter()
    expect(lock).toHaveBeenCalledTimes(1)
  })

  it('exit 幂等：未进入时 exit 不加解，重复 exit 只解一次', () => {
    const { fs, unlock } = setup()
    fs.exit()
    expect(unlock).not.toHaveBeenCalled()
    fs.enter()
    fs.exit()
    fs.exit()
    expect(unlock).toHaveBeenCalledTimes(1)
  })

  it('无 target 参数也能工作（覆盖层只靠模板绑类名，不做 DOM 操作）', () => {
    const { fs } = setup()
    fs.enter()
    expect(fs.isFullscreen.value).toBe(true)
  })
})
