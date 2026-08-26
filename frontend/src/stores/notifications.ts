import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api'
import type { Notification } from '../api/types'

export const useNotificationsStore = defineStore('notifications', () => {
  const unreadCount = ref(0)
  const list = ref<Notification[]>([])
  const loaded = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  async function refreshUnread() {
    try {
      unreadCount.value = (await api.getUnreadCount()).count
    } catch {
      /* 静默 */
    }
  }

  async function load(force = false) {
    if (loaded.value && !force) return
    try {
      list.value = await api.listNotifications({ page_size: 50 })
      loaded.value = true
    } catch {
      list.value = []
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

  return { unreadCount, list, loaded, refreshUnread, load, markRead, markAllRead, startPolling, stopPolling }
})
