import { computed, ref } from 'vue'

/** 本地列表分页：传入「过滤后的完整列表」getter，返回分页状态。 */
export function useLocalPagination<T>(getItems: () => T[], pageSize = 8) {
  const page = ref(1)
  const total = computed(() => getItems().length)
  const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
  const paged = computed(() => getItems().slice((page.value - 1) * pageSize, page.value * pageSize))

  function setPage(p: number) {
    page.value = Math.min(Math.max(1, p), pages.value)
  }

  return { page, total, pages, paged, setPage, pageSize }
}
