import { computed, ref } from 'vue'
import type { Ref } from 'vue'

export interface LoadMoreResult<T> {
  items: T[]
  total: number
}

/**
 * 累积式列表加载（P2-d 分页统一）。
 *
 * 收敛前的四种分页实现里，这一支（"加载更多"）有 5 处各写各的：
 *  · HomeView.latest 自己维护 latestPage/latestBusy/latestTotal 再拼按钮
 *  · ModelDetailView 自己维护 demoLoading + reset ? FIRST : STEP
 *  · TagDetailView / UserView / PublicView 干脆**只发 page_size=50 一次就完事** ——
 *    第 51 件及以后的作品静默消失，页面上没有任何"还有更多"的提示（这是 bug，不是取舍）
 *
 * 本 composable 只管累积与边界，不管渲染；按钮/提示交给 <LoadMore>。
 * 关键不变量：
 *  ① 并发安全：loading 期间重复调用直接返回（按钮 disabled 之外再兜一层，
 *     因为 IntersectionObserver / 键盘连击都可能绕过 disabled）；
 *  ② hasMore 由"已拿到的条数 < total"判定，不靠"本页是否满页"猜（后端 total 是权威）；
 *  ③ reset() 会把 error 清掉，避免一次失败后错误态粘住。
 */
export function useLoadMore<T>(
  fetcher: (params: { page: number; page_size: number }) => Promise<LoadMoreResult<T>>,
  pageSize = 24,
) {
  // 注意：这里必须保持 Ref 类型（不能写成 `as { value: T[] }`）——
  // 断言会抹掉 ref 标记，模板里 `items.length` 就取不到值（build 才报，--noEmit 不报）。
  const items = ref([]) as Ref<T[]>
  const total = ref(0)
  const page = ref(0)
  const loading = ref(false)
  const error = ref('')
  const hasMore = computed(() => items.value.length < total.value)

  async function fetchNext(reset: boolean) {
    if (loading.value) return
    if (!reset && !hasMore.value && page.value > 0) return
    loading.value = true
    error.value = ''
    const next = reset ? 1 : page.value + 1
    try {
      const res = await fetcher({ page: next, page_size: pageSize })
      items.value = reset ? res.items : [...items.value, ...res.items]
      total.value = res.total
      page.value = next
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  /** 首次加载 / 换筛选条件后重来 */
  const loadFirst = () => fetchNext(true)
  /** 追加下一页 */
  const loadMore = () => fetchNext(false)

  return { items, total, page, pageSize, loading, error, hasMore, loadFirst, loadMore }
}
