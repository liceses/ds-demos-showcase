import { computed, ref, watch } from 'vue'

/** 本地列表分页：传入「过滤后的完整列表」getter，返回分页状态。 */
export function useLocalPagination<T>(getItems: () => T[], pageSize = 8) {
  const page = ref(1)
  const total = computed(() => getItems().length)
  const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
  const paged = computed(() => getItems().slice((page.value - 1) * pageSize, page.value * pageSize))

  function setPage(p: number) {
    page.value = Math.min(Math.max(1, p), pages.value)
  }

  // RF-2：过滤/搜索后条目变少时把页码夹回范围内。
  // 否则「停在第 2 页 → 切筛选只剩 2 条」会出现：pages=1 让翻页条隐藏、
  // slice(8,16)=[] 让表体空白，而空态判的是过滤后总数（不为 0）→ 表空白且无法自救，
  // 只能刷新页面（实测 AdminUsersSection）。
  watch(pages, (p) => {
    if (page.value > p) page.value = p
  })

  return { page, total, pages, paged, setPage, pageSize }
}
