// API 统一出口：默认 Mock 模式；设置 VITE_USE_MOCK=false 切换真实后端。
import { http } from './http'
import { mockApi } from './mock'
import type {
  AdminDemo,
  AdminUser,
  AuthResponse,
  Comment,
  CommitDetail,
  CommitInfo,
  CreateDemoPayload,
  DemoDetail,
  DemoListParams,
  DemoSummary,
  Paginated,
  SessionLog,
  Settings,
  Tag,
  UpdateDemoPayload,
  User,
} from './types'

const useMock = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false'

export const isMock = useMock

async function downloadFile(url: string, filename: string) {
  const res = await http.get(url, { responseType: 'blob' })
  const link = document.createElement('a')
  const objectUrl = URL.createObjectURL(res.data as Blob)
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

const realApi = {
  // ---------- 认证 ----------
  async login(username: string, password: string): Promise<AuthResponse> {
    const { data } = await http.post('/auth/login', { username, password })
    return data
  },
  async register(username: string, password: string): Promise<AuthResponse> {
    const { data } = await http.post('/auth/register', { username, password })
    return data
  },
  async logout(): Promise<void> {
    await http.post('/auth/logout')
  },
  async me(): Promise<User> {
    const { data } = await http.get('/auth/me')
    return data
  },
  async changePassword(old_password: string, new_password: string): Promise<void> {
    await http.post('/auth/change-password', { old_password, new_password })
  },
  async getUser(username: string): Promise<User & { demo_count: number }> {
    const { data } = await http.get(`/users/${encodeURIComponent(username)}`)
    return data
  },

  // ---------- 标签 ----------
  async listTags(): Promise<Tag[]> {
    const { data } = await http.get('/tags')
    return data
  },
  async getTag(key: string, value: string): Promise<Tag> {
    const { data } = await http.get(`/tags/${encodeURIComponent(`${key}:${value}`)}`)
    return data
  },
  async createTag(key: string, value: string, description?: string, parent_id?: number | null): Promise<Tag> {
    const { data } = await http.post('/tags', { key, value, description, parent_id })
    return data
  },

  // ---------- Demo ----------
  async listDemos(params: DemoListParams = {}): Promise<Paginated<DemoSummary>> {
    const { data } = await http.get('/demos', {
      params: {
        status: params.status,
        tag: params.tags,
        q: params.q,
        sort: params.sort,
        page: params.page,
        page_size: params.page_size,
      },
      paramsSerializer: { indexes: null },
    })
    return data
  },
  async getDemo(slug: string): Promise<DemoDetail> {
    const { data } = await http.get(`/demos/${encodeURIComponent(slug)}`)
    return data
  },
  async createDemo(payload: CreateDemoPayload): Promise<{ slug: string; status: string }> {
    const form = new FormData()
    form.append('title', payload.title)
    if (payload.description) form.append('description', payload.description)
    if (payload.tags?.length) form.append('tags', JSON.stringify(payload.tags))
    if (payload.cover) form.append('cover', payload.cover)
    form.append('file', payload.file)
    const { data } = await http.post('/demos', form)
    return data
  },
  async updateDemo(slug: string, payload: UpdateDemoPayload): Promise<void> {
    const form = new FormData()
    if (payload.title) form.append('title', payload.title)
    if (payload.description !== undefined) form.append('description', payload.description)
    if (payload.tags) form.append('tags', JSON.stringify(payload.tags))
    if (payload.cover) form.append('cover', payload.cover)
    if (payload.file) form.append('file', payload.file)
    await http.put(`/demos/${encodeURIComponent(slug)}`, form)
  },
  async deleteDemo(slug: string): Promise<void> {
    await http.delete(`/demos/${encodeURIComponent(slug)}`)
  },
  async downloadDemo(slug: string): Promise<void> {
    await downloadFile(`/demos/${encodeURIComponent(slug)}/download`, `${slug}.zip`)
  },

  // ---------- 评论 ----------
  async listComments(slug: string): Promise<Comment[]> {
    const { data } = await http.get(`/demos/${encodeURIComponent(slug)}/comments`)
    return data
  },
  async postComment(slug: string, content: string, parent_id?: number | null): Promise<Comment> {
    const { data } = await http.post(`/demos/${encodeURIComponent(slug)}/comments`, { content, parent_id })
    return data
  },

  // ---------- Session Logs ----------
  async listSessionLogs(slug: string): Promise<SessionLog[]> {
    const { data } = await http.get(`/demos/${encodeURIComponent(slug)}/session-logs`)
    return data
  },
  async getSessionLog(slug: string, filename: string): Promise<string> {
    const { data } = await http.get(`/demos/${encodeURIComponent(slug)}/session-logs/${encodeURIComponent(filename)}`, {
      responseType: 'text',
    })
    return data
  },

  // ---------- Git ----------
  async listCommits(slug: string): Promise<CommitInfo[]> {
    const { data } = await http.get(`/demos/${encodeURIComponent(slug)}/commits`)
    return data
  },
  async getCommitDetail(slug: string, hash: string): Promise<CommitDetail> {
    const { data } = await http.get(`/demos/${encodeURIComponent(slug)}/commits/${encodeURIComponent(hash)}`)
    return data
  },

  // ---------- Admin ----------
  async adminDemos(): Promise<AdminDemo[]> {
    const { data } = await http.get('/admin/demos')
    return data
  },
  async adminUsers(): Promise<AdminUser[]> {
    const { data } = await http.get('/admin/users')
    return data
  },
  async adminReview(): Promise<DemoDetail[]> {
    const { data } = await http.get('/admin/review')
    return data
  },
  async adminApprove(idOrSlug: string | number, action: 'approve' | 'reject'): Promise<void> {
    await http.post(`/admin/review/${idOrSlug}`, { action })
  },
  async getSettings(): Promise<Settings> {
    const { data } = await http.get('/admin/settings')
    return data
  },
  async updateSettings(next: Settings): Promise<Settings> {
    const { data } = await http.put('/admin/settings', next)
    return data
  },
  async updateUser(id: number, patch: Partial<Pick<User, 'role' | 'status'>>): Promise<User> {
    const { data } = await http.patch(`/users/${id}`, patch)
    return data
  },
}

export const api = useMock ? mockApi : realApi
