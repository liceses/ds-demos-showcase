// P4：通知列表的"服务端筛选 + 分页"护栏（纯逻辑，零 DOM）
//
// 背景：原实现固定发 `{ page_size: 50 }`、只有这一页，而视图层再用
// `store.list.filter(n => !n.read)` 本地过滤 —— 于是**第 51 条以前的未读永远看不到**，
// 而后端早就有 unread_only（mock 也实现了），前端从没发过。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const h = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  getUnreadCount: vi.fn(),
}))

vi.mock('../src/api', () => ({
  api: {
    listNotifications: (...args: unknown[]) => h.listNotifications(...args),
    getUnreadCount: () => h.getUnreadCount(),
    markNotificationRead: vi.fn(async () => ({})),
    markAllNotificationsRead: vi.fn(async () => ({})),
  },
}))

import { useNotificationsStore } from '../src/stores/notifications'

const PAGE_SIZE = 30

function page(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    type: 'forum_reply',
    actor: 'a',
    demo_slug: null,
    topic_id: null,
    read: false,
    created_at: '2026-01-01T00:00:00Z',
  }))
}

describe('notifications store：服务端筛选 + 分页（P4）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    h.listNotifications.mockReset()
    h.getUnreadCount.mockReset()
    h.getUnreadCount.mockResolvedValue({ count: 0 })
  })

  it('「未读」口径要把 unread_only 发给后端（原先只发 page_size:50）', async () => {
    h.listNotifications.mockResolvedValue(page(3))
    const store = useNotificationsStore()
    await store.load(true, { mode: 'unread' })
    expect(h.listNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ unread_only: true, page: 1, page_size: PAGE_SIZE }),
    )
  })

  it('「全部」口径不带 unread_only', async () => {
    h.listNotifications.mockResolvedValue(page(3))
    const store = useNotificationsStore()
    await store.load(true, { mode: 'all' })
    const arg = h.listNotifications.mock.calls[0][0] as Record<string, unknown>
    expect(arg.unread_only).toBeUndefined()
  })

  it('loadMore 追加下一页而不是替换（这是原实现丢掉的能力）', async () => {
    h.listNotifications.mockResolvedValueOnce(page(PAGE_SIZE)).mockResolvedValueOnce(page(5))
    const store = useNotificationsStore()
    await store.load(true)
    expect(store.list.length).toBe(PAGE_SIZE)
    expect(store.hasMore).toBe(true) // 满页 ⇒ 可能还有
    await store.loadMore()
    expect(store.list.length).toBe(PAGE_SIZE + 5)
    expect(h.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    expect(store.hasMore).toBe(false) // 不满页 ⇒ 到底
  })

  it('未读口径的"还有更多"用服务端 unread_count 判（该接口没有 total）', async () => {
    h.getUnreadCount.mockResolvedValue({ count: 42 })
    h.listNotifications.mockResolvedValueOnce(page(10))
    const store = useNotificationsStore()
    await store.refreshUnread()
    await store.load(true, { mode: 'unread' })
    expect(store.hasMore).toBe(true)
    expect(store.list.length).toBe(10)
  })

  it('切换口径会重取（本地过滤时代不需要，现在必须）', async () => {
    h.listNotifications.mockResolvedValue(page(3))
    const store = useNotificationsStore()
    await store.load(true, { mode: 'all' })
    expect(h.listNotifications).toHaveBeenCalledTimes(1)
    await store.load(false, { mode: 'unread' }) // 已 loaded，但口径变了
    expect(h.listNotifications).toHaveBeenCalledTimes(2)
    expect(h.listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ unread_only: true }))
  })
})
