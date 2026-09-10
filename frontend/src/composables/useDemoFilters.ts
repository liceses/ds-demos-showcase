import { computed, getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * 作品库筛选状态 + URL 双向同步（RF-4e：从 DemosView 的 1112 行里抽出）。
 *
 * 抽它的三个理由：
 * 1. **可测**：这层原来和视图的 localStorage / IntersectionObserver / matchMedia 绑在一起，
 *    逻辑一行都测不到；现在是独立合成器（onChange 注入即可断言「换筛选必重查」）。
 * 2. **幂等**（原实现最容易踩的地方）：本页自己会写 query（syncQuery），
 *    路由 watch 不能把自家写入再当成一次新导航 —— 否则每次筛选都触发两次查询。
 *    `applyRouteQuery()` 返回「是否真的变了」，只有真变才回调 onChange。
 * 3. 筛选状态（15 个 ref 里的一半）不再是视图的私有财产。
 */
export type DemoSort = 'newest' | 'popular' | 'random'
export type DemoCardMode = 'normal' | 'prompt'

export interface DemoFiltersOptions {
  /** 筛选真的变了（或应用了预设/清空）时调用：视图用它触发重查 */
  onChange: () => void
}

export function useDemoFilters(opts: DemoFiltersOptions) {
  const route = useRoute()
  const router = useRouter()

  const selectedTags = ref<string[]>([])
  const q = ref('')
  const submittedQ = ref('')
  const modelFilter = ref('')
  const sort = ref<DemoSort>('newest')
  const cardMode = ref<DemoCardMode>(localStorage.getItem('ds_card_mode') === 'prompt' ? 'prompt' : 'normal')
  const intRange = ref<Record<string, { lo: number; hi: number }>>({})

  /** 筛选计数（按钮「筛选(N)」与抽屉头「已选 N」同一口径：标签键值 + 模型实体） */
  const facetCount = computed(() => selectedTags.value.length + (modelFilter.value ? 1 : 0))

  /** 状态同步到 URL query（搜索/标签/排序可分享、可刷新还原） */
  function syncQuery() {
    const query: Record<string, string> = {}
    if (submittedQ.value) query.q = submittedQ.value
    if (selectedTags.value.length) query.tag = selectedTags.value.join(',')
    if (modelFilter.value) query.model = modelFilter.value
    if (sort.value !== 'newest') query.sort = sort.value
    void router.replace({ query })
  }

  /**
   * 从 URL query 还原筛选状态；返回「是否真的变了」。
   * 必须幂等：本页自己也会写 query，监听器不能把自家写入再当成一次新导航。
   */
  function applyRouteQuery(): boolean {
    const qq = typeof route.query.q === 'string' ? route.query.q : ''
    const tagQ = typeof route.query.tag === 'string' ? route.query.tag : ''
    const modelQ = typeof route.query.model === 'string' ? route.query.model : ''
    const sortQ =
      route.query.sort === 'popular' || route.query.sort === 'random' ? (route.query.sort as DemoSort) : sort.value
    const nextTags = tagQ ? tagQ.split(',').filter(Boolean) : selectedTags.value
    const changed =
      qq !== submittedQ.value ||
      modelQ !== modelFilter.value ||
      sortQ !== sort.value ||
      nextTags.join(',') !== selectedTags.value.join(',')
    if (!changed) return false
    if (qq) {
      q.value = qq
      submittedQ.value = qq
    }
    if (tagQ) selectedTags.value = nextTags
    modelFilter.value = modelQ
    sort.value = sortQ
    return true
  }

  /** 换了一个筛选条件：重查 + 写回 URL（视图里 8 处调用点都走这一条） */
  function apply() {
    opts.onChange()
    syncQuery()
  }

  function setCardMode(m: DemoCardMode) {
    if (cardMode.value === m) return
    cardMode.value = m
    localStorage.setItem('ds_card_mode', m)
    opts.onChange()
  }

  /** 数值键的初始范围（首屏拿到 tagKeys 后调用；已有值不覆盖） */
  function initIntRanges(
    groups: { key: string; mode: string; min?: number | null; max?: number | null; values: { value: string }[] }[],
    boundsOf: (min: number | null | undefined, max: number | null | undefined, values: { value: string }[]) => { lo: number; hi: number },
  ) {
    for (const k of groups) {
      if (k.mode === 'int' && !intRange.value[k.key]) intRange.value[k.key] = boundsOf(k.min, k.max, k.values)
    }
  }

  // pageKey 不再包含 query（同路径换筛选不重挂），所以外部链接跳来本页时靠这里同步
  const stopRouteWatch = watch(
    () => [route.query.q, route.query.tag, route.query.model, route.query.sort].join('|'),
    () => {
      if (applyRouteQuery()) opts.onChange()
    },
  )
  // 只在组件上下文注册卸载清理（合成器也可能在测试/非组件环境被调用）
  if (getCurrentInstance()) onBeforeUnmount(stopRouteWatch)

  return {
    // 状态
    selectedTags: selectedTags as Ref<string[]>,
    q,
    submittedQ,
    modelFilter,
    sort,
    cardMode,
    intRange,
    facetCount,
    // 行为
    syncQuery,
    applyRouteQuery,
    apply,
    setCardMode,
    initIntRanges,
  }
}
