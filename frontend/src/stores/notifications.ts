import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../api'
import type { Notification } from '../api/types'

/** P4：一页条数（原实现固定发 page_size:50 且只有这一页） */
const PAGE_SIZE = 30

export const useNotificationsStore = defineStore('notifications', () => {
  const unreadCount = ref(0)
  const list = ref<Notification[]>([])
  const loaded = ref(false)
  const page = ref(0)
  const loadingMore = ref(false)
  /** 上一页是否满页（后端 GET /notifications 返回**裸数组**、没有 total，
   *  所以"全部"口径只能靠"满页 ⇒ 可能还有"来判；"未读"口径另有权威上界 unread_count）。 */
  const lastPageFull = ref(false)
  const hasMore = computed(() =>
    mode === 'unread' ? list.value.length < unreadCount.value : lastPageFull.value,
  )
  /** 服务端筛选态：'all' 或 'unread'（后端支持 unread_only；mock 也实现了，之前从没发过） */
  let mode: 'all' | 'unread' = 'all'
  let timer: ReturnType<typeof setInterval> | null = null

  async function refreshUnread() {
    try {
      unreadCount.value = (await api.getUnreadCount()).count
    } catch {
      /* 静默 */
    }
  }

  async function fetchPage(next: number) {
    // 服务端筛选：这样"未读"不再只筛已加载的那一页（原先第 51 条以前的未读永远看不到）
    const res = await api.listNotifications({
      page: next,
      page_size: PAGE_SIZE,
      ...(mode === 'unread' ? { unread_only: true } : {}),
    })
    lastPageFull.value = res.length === PAGE_SIZE
    return res
  }

  async function load(force = false, opts?: { mode?: 'all' | 'unread' }) {
    if (opts?.mode && opts.mode !== mode) {
      mode = opts.mode
      loaded.value = false // 换了筛选口径 → 必须重取
    }
    if (loaded.value && !force) return
    try {
      list.value = await fetchPage(1)
      page.value = 1
      loaded.value = true
    } catch {
      list.value = []
      page.value = 0
    }
  }

  /** 追加下一页（视图底部「加载更多」） */
  async function loadMore() {
    if (loadingMore.value || !hasMore.value) return
    loadingMore.value = true
    try {
      const res = await fetchPage(page.value + 1)
      list.value = [...list.value, ...res]
      page.value += 1
    } catch {
      /* 失败就停在当前页，不吞掉已加载内容 */
    } finally {
      loadingMore.value = false
    }
  }

  async function markRead(id: number) {
    try {
      await api.markNotificationRead(id)
      const n = list.value.find((x) => x.id === id)
      if (n) n.read = true
      await refreshUnread()
    } catch {
      /* 静默 */
    }
  }

  async function markAllRead() {
    try {
      await api.markAllNotificationsRead()
      for (const n of list.value) n.read = true
      unreadCount.value = 0
    } catch {
      /* 静默 */
    }
  }

  function startPolling() {
    if (timer) return
    refreshUnread()
    timer = setInterval(refreshUnread, 30000)
  }

  function stopPolling() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    unreadCount,
    list,
    loaded,
    page,
    hasMore,
    loadingMore,
    refreshUnread,
    load,
    loadMore,
    markRead,
    markAllRead,
    startPolling,
    stopPolling,
  }
})
