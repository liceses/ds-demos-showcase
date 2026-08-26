import type { TagKeyValue } from '../api/types'

const VENDOR_PREFIX: [string, string][] = [
  ['dsv', 'DeepSeek'],
  ['deepseek', 'DeepSeek'],
  ['gpt', 'OpenAI'],
  ['o1', 'OpenAI'],
  ['o3', 'OpenAI'],
  ['claude', 'Anthropic'],
  ['gemini', 'Google'],
  ['qwen', '阿里'],
  ['doubao', '字节'],
]

export function guessVendor(value: string): string {
  const v = value.toLowerCase()
  for (const [prefix, name] of VENDOR_PREFIX) {
    if (v.startsWith(prefix)) return name
  }
  return '其他'
}

/** 把 fixed 值按 group（或厂商猜测）分组；无分组时返回单组「其他」 */
export function groupedTagValues(values: TagKeyValue[]): { group: string; values: TagKeyValue[] }[] {
  const map = new Map<string, TagKeyValue[]>()
  for (const v of values) {
    const g = v.group || guessVendor(v.value)
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(v)
  }
  return [...map.entries()].map(([group, items]) => ({ group, values: items }))
}
