// v2 模型/题目显示层工具：状态徽章文案 + 兜底位可读标签 + 样本可信度。
// 显示层一律走 funMode.tagLabel（数据/路由/复制永远用原始 slug/name）。
// 注：原 `vendorColor()`（按厂商名哈希挑 5 个粉彩色）已删除 —— 它既不是品牌色、
// 改名还会换色，颜色不承载任何真实信息；现在印章统一纸白底 + 原版品牌图标。

import { t } from '../i18n'
import { tagLabel } from './funMode'

/** 实体状态徽章 class */
export function entityStatusClass(status: string): string {
  if (status === 'unverified') return 'badge-canary'
  if (status === 'candidate') return 'badge-candidate'
  if (status === 'deprecated') return 'badge-deprecated'
  return 'badge-active'
}

/**
 * 模型显示名（Q2）：兜底位不能长得像真型号，否则「热门模型第一名为空概念」。
 * 精确型号仍走 tagLabel（整活模式联动）；族节点显示「厂商 · 未定型号」。
 */
export function modelDisplay(m: { name: string; vendor?: string | null; resolution?: string }): string {
  const r = m.resolution || 'exact'
  if (r === 'unknown') return t('models.unresolvedLabel', '未标注模型')
  if (r === 'family') {
    const vendor = m.vendor || m.name.replace(/-?unknown$/i, '')
    return `${vendor} · ${t('models.familyLabel', '未定型号')}`
  }
  return tagLabel(m.name)
}

/** 样本可信度标签：分数旁边必须带它，否则读者无法判断这个数字能不能信 */
export function sampleLabel(level?: string): string {
  if (level === 'high') return t('common.sampleHigh', '高样本')
  if (level === 'mid') return t('common.sampleMid', '中样本')
  if (level === 'low') return t('common.sampleLow', '低样本')
  return t('common.sampleNone', '无评分')
}

/** 样本可信度 class：**专用类**，不复用 .stat-*（借来的样式只会半套，视觉不合） */
export function sampleClass(level?: string): string {
  if (level === 'high') return 'sample-high'
  if (level === 'mid') return 'sample-mid'
  if (level === 'low') return 'sample-low'
  return 'sample-none'
}
