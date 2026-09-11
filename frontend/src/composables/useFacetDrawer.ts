import { computed, getCurrentInstance, onBeforeUnmount, onMounted, nextTick, ref, type Ref } from 'vue'

/**
 * 作品库分面抽屉的**形态层**（RF-4i：从 DemosView 的 1062 行里抽出）。
 *
 * 只管三件事：
 *   1. 形态判定：移动 = bottom-sheet / 桌面钉住 = 常驻侧栏 / 其余 = overlay
 *   2. 开合与钉住（钉住记忆落 localStorage）
 *   3. Esc 关闭（钉住态是常驻侧栏，不响应 Esc）
 *
 * **不管**分组内容（panelGroups / 单组展开）；移动端"进入 sheet 时收敛到恰好一组"
 * 由调用方通过 onOpen 钩子实现 —— 那部分与筛选数据的组织方式强耦合，留在视图里更清楚。
 */
export interface FacetDrawerOptions {
  /** 移动判定断点（默认与 03 §4.2 一致：720px） */
  mobileQuery?: string
  /** 打开抽屉前的钩子（视图用它做移动端单组收敛） */
  onOpen?: (mode: 'pinned' | 'overlay' | 'sheet') => void
  /**
   * 抽屉面板元素。由视图传入（模板里的 `ref="panelEl"` 属于视图），
   * 这样"模板 ref"与"聚焦逻辑"不会各持一份。
   */
  panelEl?: Ref<HTMLElement | null>
}

const PIN_LS_KEY = 'dsh_demos_facet_pin'

export function useFacetDrawer(opts: FacetDrawerOptions = {}) {
  const { mobileQuery = '(max-width: 720px)', onOpen, panelEl: externalPanelEl } = opts

  const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(mobileQuery) : null
  const isMobile = ref(mql ? mql.matches : false)
  function onMqlChange(e: MediaQueryListEvent) {
    isMobile.value = e.matches
  }

  function lsGet(k: string): string | null {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  }
  function lsSet(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* 隐私模式：钉住是增值能力，收得起就行 */
    }
  }

  const facetPinned = ref(lsGet(PIN_LS_KEY) === '1')
  const facetOpen = ref(false) // overlay / bottom-sheet 的开合（钉住态常开，不占用此态）
  const panelEl = externalPanelEl ?? ref<HTMLElement | null>(null)

  const panelMode = computed<'pinned' | 'overlay' | 'sheet'>(() =>
    isMobile.value ? 'sheet' : facetPinned.value ? 'pinned' : 'overlay',
  )
  const showPanel = computed(() => (panelMode.value === 'pinned' ? true : facetOpen.value))
  const backdropActive = computed(() => showPanel.value && panelMode.value !== 'pinned')

  function openFacet() {
    facetOpen.value = true
    onOpen?.(panelMode.value)
    void nextTick(() => panelEl.value?.focus()) // 轻量可达性：开抽屉即把焦点交给面板
  }
  function closeFacet() {
    facetOpen.value = false
  }
  function toggleFacet() {
    facetOpen.value ? closeFacet() : openFacet()
  }
  function pinFacet() {
    facetPinned.value = true
    facetOpen.value = false
    lsSet(PIN_LS_KEY, '1')
  }
  function unpinFacet() {
    facetPinned.value = false
    facetOpen.value = false
    lsSet(PIN_LS_KEY, '0')
  }

  /** Esc 关浮层/抽屉（钉住态是常驻侧栏，不响应 Esc） */
  function onDocKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && facetOpen.value) closeFacet()
  }

  // 只在组件上下文注册监听（测试/非组件环境调用时不打 Vue 警告）
  if (getCurrentInstance()) {
    onMounted(() => {
      mql?.addEventListener('change', onMqlChange)
      document.addEventListener('keydown', onDocKey)
    })
    onBeforeUnmount(() => {
      mql?.removeEventListener('change', onMqlChange)
      document.removeEventListener('keydown', onDocKey)
    })
  }

  return {
    isMobile: isMobile as Ref<boolean>,
    facetPinned,
    facetOpen,
    panelMode,
    showPanel,
    backdropActive,
    panelEl,
    openFacet,
    closeFacet,
    toggleFacet,
    pinFacet,
    unpinFacet,
  }
}
