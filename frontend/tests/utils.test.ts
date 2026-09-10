// RF-1 安全网：纯函数层单测（零 DOM，node 环境）。
// 这些是重构里最容易被搬来搬去、也最容易被搬错的逻辑：
// 时间解析（时区）、厂商归一化、模型显示名兜底、错误文案、匿名 id。
import { describe, expect, it, beforeEach } from 'vitest'
import { parseDate, timeAgo } from '../src/utils/time'
import { guessVendor, groupedTagValues } from '../src/utils/tagGroups'
import { entityStatusClass, modelDisplay, sampleLabel, sampleClass } from '../src/utils/modelDisplay'
import { errorMessage } from '../src/utils/error'
import { getDeviceId } from '../src/utils/anon'
import { annCls, annLabel, annUnreadCount, markAnnouncementsRead, pickAnnouncementTip } from '../src/utils/announcement'
import { lang } from '../src/i18n'
import type { TagKeyValue, Announcement } from '../src/api/types'

function kv(value: string, group?: string | null): TagKeyValue {
  return { id: 1, value, description: '', demo_count: 0, group: group ?? null, status: 'active' } as TagKeyValue
}

describe('parseDate：无时区标记按 UTC 解析', () => {
  it('不带时区的 naive ISO 补 Z（避免被当本地时间提前 8 小时）', () => {
    expect(parseDate('2026-08-01T00:00:00').toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })
  it('带 Z 的原样解析', () => {
    expect(parseDate('2026-08-01T00:00:00Z').toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })
  it('带 +08:00 偏移的原样解析', () => {
    expect(parseDate('2026-08-01T08:00:00+08:00').toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('timeAgo：中文/英文双语相对时间', () => {
  beforeEach(() => {
    lang.value = 'zh'
  })
  it('1 分钟内 = 刚刚 / just now', () => {
    const now = new Date(Date.now() - 30_000).toISOString()
    expect(timeAgo(now)).toBe('刚刚')
    lang.value = 'en'
    expect(timeAgo(now)).toBe('just now')
  })
  it('分钟/小时/天三档', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 分钟前')
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe('3 小时前')
    expect(timeAgo(new Date(Date.now() - 2 * 86400_000).toISOString())).toBe('2 天前')
  })
  it('超过 30 天回落日期串（不再显示「40 天前」）', () => {
    const old = new Date(Date.now() - 40 * 86400_000).toISOString()
    expect(timeAgo(old)).not.toMatch(/天前/)
  })
})

describe('guessVendor：模型 slug → 厂商归一化', () => {
  it('前缀表命中（大小写无关）', () => {
    expect(guessVendor('dsv4-flash')).toBe('DeepSeek')
    expect(guessVendor('DSV4-pro')).toBe('DeepSeek')
    expect(guessVendor('deepseek-v3')).toBe('DeepSeek')
    expect(guessVendor('gpt-5')).toBe('OpenAI')
    expect(guessVendor('claude-4')).toBe('Anthropic')
    expect(guessVendor('gemini-3')).toBe('Google')
    expect(guessVendor('qwen3')).toBe('阿里')
    expect(guessVendor('doubao-1.5')).toBe('字节')
  })
  it('未知前缀落「其他」', () => {
    expect(guessVendor('mystery-model')).toBe('其他')
  })
})

describe('groupedTagValues：显式分组优先，其次厂商猜测', () => {
  it('显式 group 覆盖猜测', () => {
    const groups = groupedTagValues([kv('dsv4-flash', '自定义组')])
    expect(groups).toHaveLength(1)
    expect(groups[0].group).toBe('自定义组')
  })
  it('无 group 时按厂商前缀分组', () => {
    const groups = groupedTagValues([kv('gpt-5'), kv('gpt-4'), kv('claude-4')])
    const byName = Object.fromEntries(groups.map((g) => [g.group, g.values.length]))
    expect(byName).toEqual({ OpenAI: 2, Anthropic: 1 })
  })
  it('空输入返回空数组', () => {
    expect(groupedTagValues([])).toEqual([])
  })
})

describe('modelDisplay：兜底位不能长得像真型号', () => {
  it('exact 走 tagLabel（原样）', () => {
    expect(modelDisplay({ name: 'dsv4-flash' })).toBe('dsv4-flash')
  })
  it('unknown → 「未标注模型」而不是空', () => {
    expect(modelDisplay({ name: 'x-unknown', resolution: 'unknown' })).toBe('未标注模型')
  })
  it('family → 「厂商 · 未定型号」，无 vendor 时从 name 剥后缀', () => {
    expect(modelDisplay({ name: 'ds-unknown', vendor: 'DeepSeek', resolution: 'family' })).toContain('DeepSeek')
    expect(modelDisplay({ name: 'acme-unknown', resolution: 'family' })).toContain('acme')
  })
  it('缺 resolution 时按 exact 处理（不误判成兜底位）', () => {
    expect(modelDisplay({ name: 'qwen3' })).toBe('qwen3')
  })
})

describe('状态与样本可信度', () => {
  it('entityStatusClass 四态映射', () => {
    expect(entityStatusClass('unverified')).toBe('badge-canary')
    expect(entityStatusClass('candidate')).toBe('badge-candidate')
    expect(entityStatusClass('deprecated')).toBe('badge-deprecated')
    expect(entityStatusClass('active')).toBe('badge-active')
    expect(entityStatusClass('whatever')).toBe('badge-active')
  })
  it('sampleLabel/sampleClass 三档 + 未知回落', () => {
    expect(sampleLabel('high')).toBe('高样本')
    expect(sampleLabel('mid')).toBe('中样本')
    expect(sampleLabel(undefined)).not.toBe('')
    expect(sampleClass('high')).toBeTruthy()
    expect(sampleClass(undefined)).toBeTruthy()
  })
})

describe('errorMessage：429 与后端 detail', () => {
  it('cause=429 给专门文案', () => {
    const e = new Error('Too Many Requests')
    ;(e as Error & { cause?: unknown }).cause = 429
    expect(errorMessage(e)).toBe('操作过于频繁，请稍后再试')
  })
  it('其余透出 message', () => {
    expect(errorMessage(new Error('模型不存在'))).toBe('模型不存在')
  })
  it('无 message 时用 fallback', () => {
    expect(errorMessage({})).toBe('操作失败，请稍后再试')
  })
})

describe('announcement：类型元数据与未读水位线', () => {
  it('annCls/annLabel 对已知类型有值，未知类型不崩', () => {
    expect(annCls('manual')).toBeTruthy()
    expect(annLabel('manual')).toBeTruthy()
    expect(() => annCls('nope')).not.toThrow()
    expect(() => annLabel('nope')).not.toThrow()
  })
  it('annUnreadCount 按 id 水位线统计，markAnnouncementsRead 之后水位抬升', () => {
    const items = [{ id: 5 }, { id: 6 }, { id: 7 }] as unknown as Announcement[]
    localStorage.removeItem('dsh_ann_read_max') // 水位线干净起步
    // 实测语义：不是看 read 字段，而是看 id 是否超过已读水位线
    expect(annUnreadCount(items)).toBeGreaterThan(0)
    markAnnouncementsRead([{ id: 6 } as unknown as Announcement])
    const after = annUnreadCount(items)
    expect(after).toBeLessThanOrEqual(1) // 水位线抬到 6 后最多只剩 id=7 未读
  })
  it('pickAnnouncementTip 无公告返回 null', () => {
    expect(pickAnnouncementTip([])).toBeNull()
  })
})

describe('匿名 device id', () => {
  it('无 localStorage 环境下安全返回（不抛异常）', () => {
    expect(typeof getDeviceId()).toBe('string')
  })
  it('同一环境下多次调用返回同一个值（有缓存）', () => {
    expect(getDeviceId()).toBe(getDeviceId())
  })
})
