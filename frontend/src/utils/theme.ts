/**
 * 主题模块（04 §3.5；P1-3）——paper | ink 双主题 + system 跟随。
 *
 * 机制：
 * - 持久化：localStorage `dsh_theme` ∈ 'system' | 'paper' | 'ink'（dsh_ 前缀与 funMode 等既有持久化一致）
 * - 预览：URL `?theme=paper|ink` 写 sessionStorage `dsh_theme_preview`（仅当前标签页，不落盘）
 * - 生效值：预览 > 显式选择 > system（跟随 matchMedia prefers-color-scheme）
 * - 应用：html[data-theme="paper"|"ink"]（themes.css 换绑语义角色）
 * - 硬切闸：换肤时 html.theme-switching 250ms 内禁所有 transition（themes.css），防混色过渡
 * - FOUC：index.html 头部内联 3 行先行置 data-theme，本模块挂载后接管并监听系统变化
 */

export type ThemeChoice = 'system' | 'paper' | 'ink'
export type EffectiveTheme = 'paper' | 'ink'

const LS_KEY = 'dsh_theme'
const SS_PREVIEW_KEY = 'dsh_theme_preview'
const GATE_MS = 250

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function normalize(raw: string | null): ThemeChoice {
  return raw === 'paper' || raw === 'ink' ? raw : 'system'
}

export function getChosenTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'system'
  try {
    const preview = sessionStorage.getItem(SS_PREVIEW_KEY)
    if (preview === 'paper' || preview === 'ink') return preview
    return normalize(localStorage.getItem(LS_KEY))
  } catch {
    return 'system'
  }
}

export function getEffectiveTheme(chosen: ThemeChoice = getChosenTheme()): EffectiveTheme {
  if (chosen === 'system') return media && media.matches ? 'ink' : 'paper'
  return chosen
}

/** 应用生效主题到 <html data-theme>（FOUC 之后由 initTheme 接管；一般不直接调） */
function applyTheme(effective: EffectiveTheme, withGate = false) {
  const root = document.documentElement
  if (withGate) {
    root.classList.add('theme-switching')
    void root.offsetWidth // 强制重排：确保闸类先于属性变更生效
  }
  root.dataset.theme = effective
  if (withGate) {
    window.setTimeout(() => root.classList.remove('theme-switching'), GATE_MS)
  }
}

/** 初始化：接管 FOUC，登记系统跟随监听；返回当前生效主题 */
export function initTheme(): EffectiveTheme {
  applyTheme(getEffectiveTheme())
  media?.addEventListener('change', () => {
    if (getChosenTheme() === 'system') applyTheme(getEffectiveTheme(), true)
  })
  return getEffectiveTheme()
}

/**
 * 设主题（顶栏循环/抽屉调用）。
 * cycle=true：paper↔ink 循环（system 不参与循环，四路径里「系统跟随」由 ?theme= 重置承担）
 */
export function setTheme(choice: ThemeChoice, opts: { cycle?: boolean } = {}) {
  let next: ThemeChoice = choice
  if (opts.cycle) {
    const cur = getEffectiveTheme()
    next = cur === 'paper' ? 'ink' : 'paper'
  }
  try {
    sessionStorage.removeItem(SS_PREVIEW_KEY)
    localStorage.setItem(LS_KEY, next)
  } catch {
    /* 隐私模式落不了盘：仅本次会话生效 */
  }
  applyTheme(getEffectiveTheme(next), true)
  return next
}

/** ?theme= 预览（04 §3.5：仅当前标签页生效，不写 localStorage） */
export function applyThemePreviewFromUrl() {
  if (typeof window === 'undefined') return
  const q = new URLSearchParams(window.location.search).get('theme')
  if (q === 'paper' || q === 'ink') {
    try {
      sessionStorage.setItem(SS_PREVIEW_KEY, q)
    } catch {
      /* ignore */
    }
    applyTheme(q)
  }
}
