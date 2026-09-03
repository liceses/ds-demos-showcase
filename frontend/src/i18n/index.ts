// 零依赖 i18n：显示层语言切换。
// 约定（覆盖式）：模板里 t('view.key', '中文原文') —— 中文原文内联保留作为回落源，
// en.ts 按 key 覆盖英文；en 缺 key 时安全回落中文，**绝不上屏 key 本身**。
// 与 funMode 同机制：响应式 ref 驱动，keepAlive 页面切语言自动重渲染。
// 边界：只翻 UI 固定文案；UGC（标题/简介/帖子）、标签值、slug 一律不翻。

import { ref } from 'vue'
import { en } from './en'

export type Lang = 'zh' | 'en'

const LS_KEY = 'dsh_lang'
const SS_KEY = 'dsh_lang_preview' // ?lang= 当前标签页覆盖（可分享英文链接）

function detectNav(): Lang {
  const n = (navigator.language || '').toLowerCase()
  return n.startsWith('en') ? 'en' : 'zh' // 站点根本盘中文：非 en 浏览器一律 zh
}

const q = new URLSearchParams(location.search).get('lang')
if (q === 'en' || q === 'zh') sessionStorage.setItem(SS_KEY, q)

export const lang = ref<Lang>(
  (sessionStorage.getItem(SS_KEY) as Lang | null) ||
  (localStorage.getItem(LS_KEY) as Lang | null) ||
  detectNav(),
)

/** 手动切换（顶栏开关等）：持久化 + 清除标签页覆盖（显式选择优先于 ?lang） */
export function setLang(l: Lang) {
  lang.value = l
  localStorage.setItem(LS_KEY, l)
  sessionStorage.removeItem(SS_KEY)
}

function lookup(key: string): unknown {
  let node: unknown = en
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m))
}

/** 翻译：en 缺 key 时回落中文原文 */
export function t(key: string, zhDefault: string, vars?: Record<string, string | number>): string {
  if (lang.value === 'zh') return interpolate(zhDefault, vars)
  const v = lookup(key)
  return interpolate(typeof v === 'string' ? v : zhDefault, vars)
}

/** 数组文案（打字机梗池等）：en 数组缺失/为空时回落中文 */
export function tArr(key: string, zhDefault: string[]): string[] {
  if (lang.value === 'zh') return zhDefault
  const v = lookup(key)
  return Array.isArray(v) && v.length ? (v as string[]) : zhDefault
}

// ---------- 标签键 label（后端 label 是中文，前端按 key 映射；未知 key 回落后端值） ----------
const KEY_LABELS: Record<string, string> = {
  model: 'Model',
  type: 'Type',
  category: 'Category',
  game: 'Game',
  rounds: 'Rounds',
  plugin: 'Plugin',
  skills: 'Skills',
  preset: 'Preset',
  platform: 'Platform',
  time: 'Time',
  author: 'Author',
}

export function keyLabel(key: string, zhLabel?: string): string {
  if (lang.value === 'en' && KEY_LABELS[key]) return KEY_LABELS[key]
  return zhLabel || key
}

// ---------- 标签模式 / 厂商分组名（多视图复用） ----------
export function modeLabel(mode: string): string {
  if (lang.value === 'en') return mode === 'fixed' ? 'Fixed' : mode === 'open' ? 'Open' : 'Numeric'
  return mode === 'fixed' ? '固定值' : mode === 'open' ? '自定义值' : '数字值'
}

/** 厂商分组名：中文猜测组名映射，专有名词原样 */
const VENDOR_LABELS: Record<string, string> = {
  阿里: 'Alibaba', 字节: 'ByteDance', 腾讯: 'Tencent', 智谱: 'Zhipu', 月之暗面: 'Moonshot',
  百川: 'Baichuan', 其他: 'Other', 未分组: 'Ungrouped', 网传灰测: 'Grey-test',
}

export function vendorLabel(group: string): string {
  if (lang.value !== 'en') return group
  return VENDOR_LABELS[group] || group
}

/** 论坛分类 label（分类值本身是中文数据，查询恒用原值，仅显示翻译） */
const FORUM_CATS_EN: Record<string, string> = {
  交流: 'Chat', 分享: 'Share', 求助: 'Help', 公告: 'Announcements', demo: 'Demo',
}

export function forumCatLabel(c: string): string {
  if (lang.value !== 'en') return c
  return FORUM_CATS_EN[c] || c
}

/** 路由 meta.title（中文）→ EN；未收录的原样返回 */
const ROUTE_TITLES_EN: Record<string, string> = {
  首页: 'Home', 关于本站: 'About', 作品库: 'Works', 排行榜: 'Leaderboard',
  讨论区: 'Forum', 主题: 'Topic', 发帖: 'New post', Demo: 'Demo',
  标签: 'Tags', 标签详情: 'Tag detail', 登录: 'Log in', 注册: 'Sign up',
  用户: 'User', 公开用户: 'Public', 账户设置: 'Settings', 通知: 'Notifications',
  '上传 Demo': 'Upload', 管理后台: 'Admin', '赞助/致谢管理': 'Sponsors admin', '404': '404',
  模型: 'Model', 题目: 'Task', 探索: 'Explore',
}

export function routeTitle(zhTitle: string): string {
  if (lang.value !== 'en') return zhTitle
  return ROUTE_TITLES_EN[zhTitle] || zhTitle
}
