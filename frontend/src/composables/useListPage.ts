import { ref } from 'vue'

export interface ListResult<T> {
  items: T[]
  total: number
}

/** 通用列表页状态：分页/加载/错误/刷新。fetcher 只接收分页参数，外部用闭包携带筛选条件。 */
export function useListPage<T>(fetcher: (params: { page: number; page_size: number }) => Promise<ListResult<T>>, pageSize = 20) {
  const items = ref<T[]>([])
  const total = ref(0)
  const page = ref(1)
  const loading = ref(false)
  const error = ref('')

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const res = await fetcher({ page: page.value, page_size: pageSize })
      items.value = res.items
      total.value = res.total
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  function apply() {
    page.value = 1
    return load()
  }

  return { items, total, page, pageSize, loading, error, load, apply }
}
