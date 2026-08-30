// API 统一出口：默认 Mock 模式；设置 VITE_USE_MOCK=false 切换真实后端。
import { http } from './http'
import { mockApi } from './mock'
import type {
  AdminDemo,
  AdminStats,
  AdminUser,
  Announcement,
  AnnouncementInput,
  AuthResponse,
  Comment,
  CreateDemoFromUrlPayload,
  CreateDemoPayload,
  DemoDetail,
  DemoListParams,
  ForumTopic,
  ForumReply,
  ForumTopicInput,
  ForumTopicAdminUpdate,
  ForumReport,
  ForumReportInput,
  Notification,
  ReactionSummary,
  UserProfile,
  FollowOut,
  DemoSummary,
  Paginated,
  SessionLog,
  Settings,
  SiteStats,
  SponsorBoard,
  Tag,
  TagKeyInfo,
  TagKeyValue,
  TagGroupDistribution,
  TagMergeResult,
  TagMergeInput,
  TagSuggestion,
  ThanksBoard,
  UpdateDemoPayload,
  User,
  RecognitionInput,
  RecognitionItem,
  RatingStats,
  LiveStats,
  SiteInfo,
  OssSyncJob,
} from './types'

const useMock = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false'

export const isMock = useMock

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
  async getTag(key: string, value: string): Promise<Tag> {
    const { data } = await http.get(`/tags/${encodeURIComponent(`${key}:${value}`)}`)
    return data
  },
  async createTag(key: string, value: string, description?: string, parent_id?: number | null, group?: string): Promise<Tag> {
    const { data } = await http.post('/tags', { key, value, description, parent_id, group })
    return data
  },
  async suggestTagValue(payload: { key: string; value: string; description?: string; group?: string; demo_id?: number | null }): Promise<TagSuggestion> {
    const { data } = await http.post('/tags/suggestions', payload)
    return data
  },
  async listTagSuggestions(status?: 'pending' | 'approved' | 'rejected'): Promise<TagSuggestion[]> {
    const { data } = await http.get('/tags/admin/suggestions', { params: status ? { status } : {} })
    return data
  },
  async listTagGroups(key: string): Promise<TagGroupDistribution> {
    const { data } = await http.get('/tags/admin/groups', { params: { key } })
    return data
  },
  async renameTagGroup(key: string, group: string, newGroup: string): Promise<{ updated: number; new_group: string }> {
    const { data } = await http.put(`/tags/admin/groups/${encodeURIComponent(key)}/${encodeURIComponent(group)}`, { new_group: newGroup })
    return data
  },
  async clearTagGroup(key: string, group: string): Promise<{ cleared: number }> {
    const { data } = await http.delete(`/tags/admin/groups/${encodeURIComponent(key)}/${encodeURIComponent(group)}`)
    return data
  },
  async setTagGroup(tagId: number, group: string | null): Promise<TagKeyValue> {
    const { data } = await http.put(`/tags/admin/values/${tagId}/group`, { group })
    return data
  },
  async mergeTags(payload: TagMergeInput): Promise<TagMergeResult> {
    const { data } = await http.post('/tags/admin/merge', payload)
    return data
  },

  async reviewTagSuggestion(id: number, action: 'approve' | 'reject', group?: string): Promise<TagSuggestion> {
    const { data } = await http.post(`/tags/admin/suggestions/${id}/review`, { action, group })
    return data
  },
  async fetchModels(): Promise<{ created: number; note: string }> {
    const { data } = await http.post('/tags/admin/fetch-models')
    return data
  },
  async aiSuggest(payload: { demo_id?: number; text?: string }): Promise<{ suggestions: { key: string; value: string; reason: string }[]; note: string }> {
    const { data } = await http.post('/tags/admin/ai-suggest', payload)
    return data
  },
  async listTagKeys(): Promise<TagKeyInfo[]> {
    const { data } = await http.get('/tags/tag-keys')
    return data
  },
  async createTagKey(payload: { key: string; mode: 'fixed' | 'open' | 'int'; label: string; description?: string; sort?: number }): Promise<TagKeyInfo> {
    const { data } = await http.post('/tags/admin/tag-keys', payload)
    return data
  },
  async updateTagKey(key: string, payload: { mode: 'fixed' | 'open' | 'int'; label: string; description?: string; sort?: number }): Promise<TagKeyInfo> {
    const { data } = await http.put(`/tags/admin/tag-keys/${encodeURIComponent(key)}`, payload)
    return data
  },
  async deleteTagKey(key: string): Promise<void> {
    await http.delete(`/tags/admin/tag-keys/${encodeURIComponent(key)}`)
  },
  async deleteTagValue(key: string, value: string): Promise<void> {
    await http.delete(`/tags/admin/tag-keys/${encodeURIComponent(key)}/values/${encodeURIComponent(value)}`)
  },

  // ---------- Demo ----------
  async listDemos(params: DemoListParams = {}): Promise<Paginated<DemoSummary>> {
    const { data } = await http.get('/demos', {
      params: {
        status: params.status,
        tag: params.tags,
        q: params.q,
        author: params.author,
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
  async getRelated(slug: string): Promise<DemoSummary[]> {
    const { data } = await http.get(`/demos/${encodeURIComponent(slug)}/related`, { params: { limit: 30 } })
    return data
  },
  async getRating(slug: string, deviceId?: string): Promise<RatingStats> {
    const { data } = await http.get(`/demos/${encodeURIComponent(slug)}/rating`, { params: deviceId ? { device_id: deviceId } : {} })
    return data
  },
  async rateDemo(slug: string, score: number, deviceId?: string): Promise<RatingStats> {
    const { data } = await http.post(`/demos/${encodeURIComponent(slug)}/rating`, { score, device_id: deviceId || '' })
    return data
  },
  async unrateDemo(slug: string, deviceId?: string): Promise<RatingStats> {
    const { data } = await http.delete(`/demos/${encodeURIComponent(slug)}/rating`, { params: deviceId ? { device_id: deviceId } : {} })
    return data
  },
  async getLeaderboard(
    sort: 'avg' | 'god' | 'ghost' | 'net' | 'count' | 'heat',
    page = 1,
    pageSize = 20,
    range: 'all' | 'week' | 'month' = 'all',
  ): Promise<Paginated<DemoSummary>> {
    const { data } = await http.get('/leaderboard', { params: { sort, page, page_size: pageSize, range } })
    return data
  },
  async getForumTopic(id: number): Promise<ForumTopic | null> {
    try {
      const { data } = await http.get(`/forum/topics/${id}`)
      return data
    } catch {
      return null
    }
  },
  async getReactionSummary(targetType: 'topic' | 'reply', targetId: number): Promise<ReactionSummary> {
    const { data } = await http.get('/forum/reactions/summary', { params: { target_type: targetType, target_id: targetId } })
    return data
  },
  async toggleReaction(targetType: 'topic' | 'reply', targetId: number, reactionType: 'like' | 'thanks'): Promise<ReactionSummary & { active: boolean }> {
    const { data } = await http.post('/forum/reactions', { target_type: targetType, target_id: targetId, reaction_type: reactionType })
    return data
  },
  async getUserProfile(username: string): Promise<UserProfile> {
    const { data } = await http.get(`/users/${encodeURIComponent(username)}/profile`)
    return data
  },
  async toggleFollow(userId: number): Promise<FollowOut> {
    const { data } = await http.post(`/users/${userId}/follow`)
    return data
  },
  async listFollowers(username: string): Promise<Array<{ id: number; username: string }>> {
    const { data } = await http.get(`/users/${encodeURIComponent(username)}/followers`)
    return data
  },
  async listFollowing(username: string): Promise<Array<{ id: number; username: string }>> {
    const { data } = await http.get(`/users/${encodeURIComponent(username)}/following`)
    return data
  },
  async listForumTopics(params: { q?: string; category?: string; tag?: string; demo?: string; sort?: 'newest' | 'popular' | 'replies' | 'hot'; sticky?: boolean; participated?: boolean; followed?: boolean; kind?: 'general' | 'demo'; page?: number; page_size?: number } = {}): Promise<Paginated<ForumTopic>> {
    const { data } = await http.get('/forum/topics', { params })
    return data
  },
  async listForumReplies(topicId: number): Promise<ForumReply[]> {
    const { data } = await http.get(`/forum/topics/${topicId}/replies`)
    // 后端已改成分页对象 { items, total, page, page_size }；兼容旧版数组返回
    return Array.isArray(data) ? data : (data.items ?? [])
  },
  async listForumRepliesPage(topicId: number, page = 1, pageSize = 50): Promise<Paginated<ForumReply>> {
    const { data } = await http.get(`/forum/topics/${topicId}/replies`, { params: { page, page_size: pageSize } })
    return data
  },
  async createForumTopic(payload: ForumTopicInput): Promise<ForumTopic> {
    const { data } = await http.post('/forum/topics', {
      title: payload.title,
      content: payload.content || '',
      demo_slug: payload.demo_slug ?? null,
      category: payload.category || 'general',
      tags: (payload.tags || []).join(','),
    })
    return data
  },
  async createForumReply(topicId: number, content: string, parentId?: number): Promise<ForumReply> {
    const { data } = await http.post(`/forum/topics/${topicId}/replies`, { content, parent_id: parentId ?? null })
    return data
  },
  async adminListForumTopics(params: { status?: string; category?: string; pinned?: boolean; page?: number; page_size?: number } = {}): Promise<Paginated<ForumTopic>> {
    const { data } = await http.get('/forum/admin/topics', { params })
    return data
  },
  async adminUpdateForumTopic(id: number, patch: ForumTopicAdminUpdate): Promise<ForumTopic> {
    const { data } = await http.put(`/forum/admin/topics/${id}`, patch)
    return data
  },
  async adminDeleteForumTopic(id: number): Promise<void> {
    await http.delete(`/forum/admin/topics/${id}`)
  },
  async adminDeleteForumReply(id: number): Promise<void> {
    await http.delete(`/forum/admin/replies/${id}`)
  },
  async adminReviewForumTopic(id: number, action: 'approve' | 'reject'): Promise<ForumTopic> {
    const { data } = await http.post(`/forum/admin/topics/${id}/review`, { action })
    return data
  },
  async adminReviewForumReply(id: number, action: 'approve' | 'reject'): Promise<ForumReply> {
    const { data } = await http.post(`/forum/admin/replies/${id}/review`, { action })
    return data
  },
  async adminListForumReplies(params: { topic_id?: number; status?: string } = {}): Promise<ForumReply[]> {
    const { data } = await http.get('/forum/admin/replies', { params })
    return data
  },

  async listForumReports(): Promise<ForumReport[]> {
    const { data } = await http.get('/forum/admin/reports')
    return data
  },
  async handleForumReport(id: number, action: 'handle' | 'ignore'): Promise<ForumReport> {
    const { data } = await http.post(`/forum/admin/reports/${id}/handle`, { action })
    return data
  },
  async createForumReport(payload: ForumReportInput): Promise<ForumReport> {
    const { data } = await http.post('/forum/reports', payload)
    return data
  },
  async adminBanUser(id: number): Promise<void> {
    await http.post(`/forum/admin/users/${id}/ban`)
  },
  async listNotifications(params: { unread_only?: boolean; page?: number; page_size?: number } = {}): Promise<Notification[]> {
    const { data } = await http.get('/notifications', { params })
    return data
  },
  async getUnreadCount(): Promise<{ count: number }> {
    const { data } = await http.get('/notifications/unread-count')
    return data
  },
  async markNotificationRead(id: number): Promise<Notification> {
    const { data } = await http.post('/notifications/read', { id })
    return data
  },
  async markAllNotificationsRead(): Promise<void> {
    await http.post('/notifications/read-all')
  },



  async createDemo(payload: CreateDemoPayload, onProgress?: (percent: number) => void): Promise<{ slug: string; status: string; created: boolean }> {
    const form = new FormData()
    form.append('title', payload.title)
    if (payload.description) form.append('description', payload.description)
    if (payload.tags?.length) form.append('tags', JSON.stringify(payload.tags))
    if (payload.demo_type) form.append('demo_type', payload.demo_type)
    if (payload.external_url) form.append('external_url', payload.external_url)
    if (payload.prompt) form.append('prompt', payload.prompt)
    if (payload.video_url) form.append('video_url', payload.video_url)
    if (payload.cover) form.append('cover', payload.cover)
    if (payload.file) form.append('file', payload.file)
    if (payload.idempotency_key) form.append('idempotency_key', payload.idempotency_key)
    if (payload.upload_code) form.append('upload_code', payload.upload_code)
    if (payload.force) form.append('force', 'true')
    // 上传含解压 + OSS 传输，放宽超时（默认 15s 不够）；onUploadProgress 给前端进度条
    const { data } = await http.post('/demos', form, {
      timeout: 120000,
      onUploadProgress: onProgress
        ? (e) => {
            if (e.total) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)))
          }
        : undefined,
    })
    return data
  },
  async createDemoFromUrl(payload: CreateDemoFromUrlPayload): Promise<{ slug: string; status: string; created: boolean }> {
    const { data } = await http.post('/demos/from-url', payload, { timeout: 120000 })
    return data
  },
  async updateDemo(slug: string, payload: UpdateDemoPayload, onProgress?: (percent: number) => void): Promise<void> {
    const form = new FormData()
    if (payload.title) form.append('title', payload.title)
    if (payload.description !== undefined) form.append('description', payload.description)
    if (payload.tags) form.append('tags', JSON.stringify(payload.tags))
    if (payload.demo_type) form.append('demo_type', payload.demo_type)
    if (payload.external_url !== undefined) form.append('external_url', payload.external_url || '')
    if (payload.prompt !== undefined) form.append('prompt', payload.prompt)
    if (payload.video_url !== undefined) form.append('video_url', payload.video_url || '')
    if (payload.cover) form.append('cover', payload.cover)
    if (payload.file) form.append('file', payload.file)
    if (payload.commit_message) form.append('commit_message', payload.commit_message)
    if (payload.keep_old_version) form.append('keep_old_version', 'true')
    await http.put(`/demos/${encodeURIComponent(slug)}`, form, {
      timeout: 120000,
      onUploadProgress: onProgress
        ? (e) => {
            if (e.total) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)))
          }
        : undefined,
    })
  },
  async deleteDemo(slug: string): Promise<void> {
    await http.delete(`/demos/${encodeURIComponent(slug)}`)
  },
  async downloadDemo(slug: string): Promise<void> {
    // 直接整页导航下载：后端 307 → OSS（Content-Disposition: attachment）触发浏览器原生下载。
    // 不经过 XHR/blob，因此不需要 OSS CORS 放行主站源；大 zip 走流式下载也不占内存。
    window.location.assign(`/api/v1/demos/${encodeURIComponent(slug)}/download`)
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
  async ossSync(force = false): Promise<{ started: boolean; job: OssSyncJob }> {
    // 后台任务：立即返回，前端轮询 /admin/oss-sync-status 看进度
    const { data } = await http.post('/admin/oss-sync', null, { params: force ? { force: true } : {} })
    return data
  },
  async getOssSyncStatus(): Promise<OssSyncJob> {
    const { data } = await http.get('/admin/oss-sync-status')
    return data
  },
  async getAdminStats(): Promise<AdminStats> {
    const { data } = await http.get('/admin/stats')
    return data
  },
  async storageStatus(): Promise<{ oss_enabled: boolean; mode: string; local_demos: number; local_files: number; local_size_bytes: number }> {
    const { data } = await http.get('/admin/storage-status')
    return data
  },
  async updateUser(id: number, patch: Partial<Pick<User, 'role' | 'status'>>): Promise<User> {
    const { data } = await http.patch(`/users/${id}`, patch)
    return data
  },

  // ---------- 站点统计 / 赞助榜（关于本站页） ----------
  async getSiteStats(): Promise<SiteStats> {
    const { data } = await http.get('/stats/visits')
    return data
  },
  async reportVisit(): Promise<void> {
    // 页面访问打点：一次路由切换 = 一次浏览（原始 PV +1）；失败静默
    http.post('/stats/visit').catch(() => undefined)
  },
  async reportHeartbeat(): Promise<void> {
    // 实时在线心跳：每 30s 一次；失败静默
    http.post('/stats/heartbeat').catch(() => undefined)
  },
  async getLiveStats(): Promise<LiveStats> {
    const { data } = await http.get('/stats/live')
    return data
  },
  // 站点公开概况（后端 60s 缓存 + CDN 可缓存）：内容/社区/流量/热门一次拿全
  async getSiteInfo(): Promise<SiteInfo> {
    const { data } = await http.get('/meta/site-info')
    return data
  },
  async getSponsors(): Promise<SponsorBoard> {
    const { data } = await http.get('/stats/sponsors')
    return data
  },
  async getThanks(): Promise<ThanksBoard> {
    const { data } = await http.get('/stats/thanks')
    return data
  },
  // 管理：赞助 / 致谢
  async listRecognition(): Promise<{ items: RecognitionItem[] }> {
    const { data } = await http.get('/stats/recognition')
    return data
  },
  async createRecognition(payload: RecognitionInput): Promise<{ id: number }> {
    const { data } = await http.post('/stats/recognition', payload)
    return data
  },
  async updateRecognition(id: number, payload: RecognitionInput): Promise<{ id: number }> {
    const { data } = await http.put(`/stats/recognition/${id}`, payload)
    return data
  },
  async deleteRecognition(id: number): Promise<void> {
    await http.delete(`/stats/recognition/${id}`)
  },

  // ---------- 公告 ----------
  async listAnnouncements(): Promise<Announcement[]> {
    const { data } = await http.get('/announcements')
    return data
  },
  async adminListAnnouncements(params: { status?: string; category?: string; pinned?: boolean } = {}): Promise<Announcement[]> {
    const { data } = await http.get('/admin/announcements', { params })
    return data
  },
  async createAnnouncement(payload: AnnouncementInput): Promise<Announcement> {
    const { data } = await http.post('/admin/announcements', payload)
    return data
  },
  async updateAnnouncement(id: number, payload: AnnouncementInput): Promise<Announcement> {
    const { data } = await http.put(`/admin/announcements/${id}`, payload)
    return data
  },
  async deleteAnnouncement(id: number): Promise<void> {
    await http.delete(`/admin/announcements/${id}`)
  },
}

export const api = useMock ? mockApi : realApi
