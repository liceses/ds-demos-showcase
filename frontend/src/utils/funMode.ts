// 整活模式（fun mode）：纯显示层替换，后端开关经 /meta/site-info 的 display.fun_mode 广播。
//
// 三条铁律（防 bug 边界，改动前必读）：
// 1. 只改「渲染文案」——数据、URL、路由参数、请求载荷、点击复制的内容永远是原始值；
//    标签值用全等匹配替换，绝不做子串/自由文本替换。
// 2. 自由文本（prompt / description / Markdown 正文）一律不翻译。
// 3. /admin 路由豁免（adminExempt）：管理界面恒显真实值，避免把 astra-grey 当真值再建一遍。

import { computed, ref } from 'vue'
import { lang, setLang, type Lang } from '../i18n'

const LS_KEY = 'dsh_fun_mode' // 上次已知的全站状态（防上屏闪烁的预 seed，非真源）
const SS_KEY = 'dsh_fun_mode_preview' // ?fun=1/0 当前标签页预览覆盖（sessionStorage）

/** 全站开关（真源在后端 Setting 表，经 site-info 同步到此） */
export const funMode = ref(false)
/** /admin 路由豁免，App.vue 随路由 watch 维护 */
export const adminExempt = ref(false)

/** 预览覆盖：?fun=1 强制开 / ?fun=0 强制关，只影响当前标签页 */
const preview = ref<'1' | '0' | null>((sessionStorage.getItem(SS_KEY) as '1' | '0' | null) || null)

export function setPreview(v: '1' | '0' | null) {
  preview.value = v
  if (v) sessionStorage.setItem(SS_KEY, v)
  else sessionStorage.removeItem(SS_KEY)
}

// 模块初始化：读 URL 预览参数 + localStorage 预 seed（真实值由 App.vue 拉 site-info 校正）
const q = new URLSearchParams(location.search).get('fun')
if (q === '1' || q === '0') preview.value = q
funMode.value = localStorage.getItem(LS_KEY) === '1'

/** App.vue 拉到后端 site-info 后调用：写入全站开关并缓存防闪 + 语言预设（fun ON → EN，可手动切回） */
let funSavedLang: Lang | null = null
export function applyServerFunMode(on: boolean) {
  const was = funMode.value
  funMode.value = on
  localStorage.setItem(LS_KEY, on ? '1' : '0')
  if (!was && on && lang.value !== 'en') {
    funSavedLang = lang.value
    setLang('en') // 整蛊预设英文；fun 关闭时若未被手动改过则恢复
  } else if (was && !on && funSavedLang !== null) {
    if (lang.value === 'en') setLang(funSavedLang) // fun 期间被手动改成非 EN 则尊重手动选择
    funSavedLang = null
  }
}

/** 最终生效状态（预览覆盖 > 后端开关 - admin 豁免） */
export const funEffective = computed(() => {
  if (preview.value === '1') return true
  if (preview.value === '0') return false
  return funMode.value && !adminExempt.value
})

/** 标签值显示层翻译：全等匹配，原值优先返回 */
export function tagLabel(v: string): string {
  if (!funEffective.value) return v
  if (v === 'ds-unknown') return 'astra-grey'
  return v
}

/** "key:value" 字符串的显示层翻译（已选筛选 chips 等）：key 原样，仅 value 走 tagLabel */
export function tagStrLabel(s: string): string {
  const i = s.indexOf(':')
  if (i < 0) return tagLabel(s)
  return s.slice(0, i + 1) + tagLabel(s.slice(i + 1))
}

/** 站点标题/品牌文案（随 fun 开关 + 语言双切换） */
export const titleBase = computed(() => {
  if (funEffective.value) return lang.value === 'en' ? 'astra grey-test works collection' : 'astra 灰测作品收集'
  return lang.value === 'en' ? 'AI Demo Makers' : 'AI 全民制作人'
})
