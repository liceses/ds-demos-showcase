// 作品库筛选抽屉的纯函数层（RF-4d：从 DemosView 的 1173 行 setup 里下沉出来）。
//
// 为什么必须下沉：这些函数原本内联在视图 setup 里，而 DemosView 需要
// localStorage / matchMedia / IntersectionObserver / vue-router 四件外部依赖才能挂载 ——
// 纯逻辑因此**完全无法单测**。下沉后它们可被 vitest 直接断言（见 tests/demoFacets.test.ts）。
import { tagStrLabel } from './funMode'

/** 分面组（抽屉里一组筛选值的形状，只需这几个字段即可计算） */
export interface FacetGroup {
  key: string
  min?: number | null
  max?: number | null
  values: { value: string; count?: number; description?: string }[]
}

/** 数值键的快捷档（三分位，尾档开放 N+） */
export interface QuickPreset {
  label: string
  lo: number
  hi: number
}

/**
 * 数值键的取值范围。
 * 后端给了 min/max 就用它；没给则从实际值里取最小/最大，并保底留出三档 ——
 * 保底只在**无后端范围**时兜：min=max=3 的真实数据不该长出「5+」这种超数据档位。
 */
export function intBoundsOf(
  min: number | null | undefined,
  max: number | null | undefined,
  rawValues: { value: string }[],
): { lo: number; hi: number } {
  const nums = rawValues.map((v) => Number.parseInt(v.value, 10)).filter(Number.isFinite) as number[]
  const hasRange = min != null && max != null
  const lo = min ?? (nums.length ? Math.min(...nums) : 0)
  let hi = max ?? (nums.length ? Math.max(...nums) : lo + 8)
  if (!hasRange) hi = Math.max(hi, lo + 2)
  return { lo, hi }
}

export function intBounds(group: FacetGroup): { lo: number; hi: number } {
  return intBoundsOf(group.min, group.max, group.values)
}

/** 三分位快捷档：跨度不足 3 档就不给（给了也没意义） */
export function quickPresets(group: FacetGroup): QuickPreset[] {
  const { lo, hi } = intBounds(group)
  const span = hi - lo + 1
  if (span < 3) return []
  const third = Math.max(1, Math.ceil(span / 3))
  const e1 = lo + third
  const e2 = lo + 2 * third
  const out: QuickPreset[] = []
  if (e1 <= hi) out.push({ label: `${lo}-${e1 - 1}`, lo, hi: e1 - 1 })
  if (e2 <= hi) {
    out.push({ label: `${e1}-${e2 - 1}`, lo: e1, hi: e2 - 1 })
    out.push({ label: `${e2}+`, lo: e2, hi })
  } else if (e1 <= hi) {
    out.push({ label: `${e1}+`, lo: e1, hi })
  }
  return out
}

/**
 * 已选 chip 的摘要文案：数值范围走「key lo-hi」空格形（冒号不利于范围读法），
 * 其余交给 tagStrLabel（整活模式联动）。
 */
export function chipLabel(s: string): string {
  const i = s.indexOf(':')
  if (i < 0) return tagStrLabel(s)
  const v = s.slice(i + 1)
  if (/^-?\d+(-\d+)?$/.test(v)) return s.slice(0, i) + ' ' + v
  return tagStrLabel(s)
}

/** 厂商分组点的颜色（纯展示映射，随组件搬出以免再复制一份） */
export const VENDOR_DOT: Record<string, string> = {
  DeepSeek: 'var(--teal)',
  OpenAI: 'var(--ink)',
  Anthropic: 'var(--red)',
  Google: 'var(--mint)',
  阿里: 'var(--yellow)',
  字节: 'var(--paper)',
  其他: '#999',
}

export function vendorDot(group: string): string {
  return VENDOR_DOT[group] || '#999'
}
