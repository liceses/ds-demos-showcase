// 端侧图片压缩：纯函数部分（node 环境可跑）—— 解码/编码管线只能在浏览器里验（见 CDP 实测）
import { describe, expect, it } from 'vitest'
import { MAX_RAW_BYTES, centerSquare, fitWithin, shouldSkip } from '../src/utils/imageCompress'

describe('fitWithin（等比缩到最长边）', () => {
  it('横图按宽缩', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200, scale: 0.4 })
  })
  it('竖图按高缩', () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600, scale: 0.4 })
  })
  it('方图两边同缩', () => {
    expect(fitWithin(2000, 2000, 512)).toEqual({ w: 512, h: 512, scale: 0.256 })
  })
  it('本来就小 → 原样，不放大', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600, scale: 1 })
  })
  it('刚好等于上限 → 不缩', () => {
    expect(fitWithin(1600, 900, 1600).scale).toBe(1)
  })
  it('非法尺寸不炸（返回 0 且 scale=1）', () => {
    expect(fitWithin(0, 0, 1600)).toEqual({ w: 0, h: 0, scale: 1 })
  })
  it('极端长条也不会缩成 0 边', () => {
    expect(fitWithin(10000, 3, 1600).h).toBeGreaterThanOrEqual(1)
  })
})

describe('centerSquare（居中裁方）', () => {
  it('宽 > 高：按高取方，横向居中', () => {
    expect(centerSquare(4000, 3000)).toEqual({ sx: 500, sy: 0, size: 3000 })
  })
  it('高 > 宽：按宽取方，纵向居中', () => {
    expect(centerSquare(3000, 4000)).toEqual({ sx: 0, sy: 500, size: 3000 })
  })
  it('奇数差取整且不越界', () => {
    const r = centerSquare(101, 100)
    expect(r.size).toBe(100)
    expect(r.sx + r.size).toBeLessThanOrEqual(101)
    expect(r.sx).toBeGreaterThanOrEqual(0)
  })
  it('已经是方图：不偏移', () => {
    expect(centerSquare(512, 512)).toEqual({ sx: 0, sy: 0, size: 512 })
  })
})

describe('shouldSkip（幂等：小图直通，不做无意义重编码）', () => {
  it('小图且尺寸达标 → 跳过压缩', () => {
    expect(shouldSkip(120 * 1024, 1200, 900, { maxEdge: 1600 })).toBe(true)
  })
  it('小图但尺寸超限 → 必须压', () => {
    expect(shouldSkip(120 * 1024, 4000, 3000, { maxEdge: 1600 })).toBe(false)
  })
  it('尺寸达标但字节很大 → 必须压', () => {
    expect(shouldSkip(5 * 1024 * 1024, 1200, 900, { maxEdge: 1600 })).toBe(false)
  })
  it('头像：非方图即使很小也要裁', () => {
    expect(shouldSkip(50 * 1024, 800, 600, { square: 512 })).toBe(false)
  })
  it('头像：方图且小 → 直通', () => {
    expect(shouldSkip(50 * 1024, 512, 512, { square: 512 })).toBe(true)
  })
})

describe('上限口径（与后端 max_file_size 一致）', () => {
  it('只拦异常大的文件（200MB），不做"图片太大"式限制', () => {
    expect(MAX_RAW_BYTES).toBe(200 * 1024 * 1024)
  })
})
