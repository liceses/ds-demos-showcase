// API 类型：与项目计划书中的 FastAPI 契约对齐

export interface User {
  id: number
  username: string
  role: 'user' | 'admin'
  status: 'active' | 'suspended' | 'deleted'
  bio: string
  created_at: string
  demo_count?: number
}

export interface TagRef {
  key: string
  value: string
}

/** 提交标签：字符串 "k:v" 或带介绍的对象（open/int 创建时可填 description） */
export type TagInput = string | { key: string; value: string; description?: string }

export interface Tag extends TagRef {
  id: number
  description: string
  parent_id: number | null
  demo_count: number
  child_count: number
  children?: Tag[]
  parent?: Tag | null
  mode?: string
}

export interface TagKeyValue {
  id?: number
  value: string
  description: string
  demo_count: number
  group?: string | null
}

export interface TagKeyInfo {
  key: string
  mode: 'fixed' | 'open' | 'int'
  label: string
  description: string
  sort: number
  values: TagKeyValue[]
  demo_count: number
  min?: number | null
  max?: number | null
}

export interface TagSuggestion {
  id: number
  key: string
  value: string
  description: string
  group?: string | null
  status: 'pending' | 'approved' | 'rejected'
  demo_id?: number | null
  created_at: string
}

export interface TagGroupDistribution {
  key: string
  groups: { group: string; count: number }[]
  ungrouped: number
}

export interface TagMergeResult {
  merged: number
  removed_dups: number
  affected_demos: number
  deleted_source: boolean
  dry_run: boolean
}

export interface TagMergeInput {
  from_key: string
  from_value: string
  to_key: string
  to_value: string
  dry_run: boolean
}

export interface DemoSummary {
  slug: string
  title: string
  description: string
  cover_url: string
  author: string
  author_id: number | null
  tags: TagRef[]
  view_count: number
  download_count: number
  comment_count: number
  created_at: string
  status?: string
  /** web=网页应用 zip=文件包 link=外部链接 */
  demo_type?: 'web' | 'zip' | 'link'
  external_url?: string | null
  /** 第一轮提示词（列表摘要返回，供提示词模式展示/复制） */
  prompt?: string
  rating_avg?: number
  rating_count?: number
  rating_god?: number
  rating_ghost?: number
}

export interface RatingStats {
  my_score: number | null
  avg: number
  count: number
  god: number
  ghost: number
  distribution?: { score: number; count: number }[]
}

export interface LiveStats {
  online: number
  last1min: number
  last5min: number
  today: number
}

export interface DemoTimelineEntry {
  id: number
  version_label: string
  message: string
  old_slug: string | null
  created_at: string
}

export interface DemoDetail extends DemoSummary {
  /** 预览入口：OSS 直链（跨源）或 /preview 相对路径；跨源时前端才会对 iframe 开 allow-same-origin */
  preview_url?: string
  session_log_count: number
  is_author: boolean
  /** 第一轮提示词 */
  prompt?: string
  /** 介绍视频链接（服务器不存视频） */
  video_url?: string | null
  file_size?: number
  storage_size?: number
  /** 单文件项目（下载按钮显示「下载文件」而非「下载 ZIP」） */
  single_file?: boolean
  inconsistency?: boolean
  timeline?: DemoTimelineEntry[]
  /** Mock 模式专用：iframe srcdoc */
  previewHtml?: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface Comment {
  id: number
  demo_id: number
  user_id: number
  username: string
  parent_id: number | null
  content: string
  created_at: string
  children?: Comment[]
}

export interface SessionLog {
  id: number
  filename: string
  file_size: number
  created_at: string
}

export interface AdminDemo extends DemoDetail {
  storage_size: number
  inconsistency: boolean
}

export interface AdminUser extends User {
  demo_count: number
}

export interface Settings {
  auto_approve: boolean
  /** 未注册（public）上传是否直接放行 */
  auto_approve_public: boolean
}

export interface AuthResponse {
  access_token: string
  user: User
}

export interface DemoListParams {
  status?: string
  tags?: string[]
  q?: string
  /** 作者过滤：public = 未注册上传；其他 = 用户名 */
  author?: string
  sort?: 'newest' | 'popular' | 'random' | 'prompt'
  page?: number
  page_size?: number
}

export interface CreateDemoPayload {
  title: string
  description?: string
  tags?: TagInput[]
  demo_type?: 'web' | 'zip' | 'link'
  external_url?: string
  prompt?: string
  video_url?: string
  cover?: File | null
  file?: File | null
  /** 幂等键：重试同 key 不重复创建 */
  idempotency_key?: string
  /** 信任通道密钥（未登录免审核） */
  upload_code?: string
  /** 管理员强制上传（跳过 zip 去重 409） */
  force?: boolean
}

export interface CreateDemoFromUrlPayload {
  title: string
  description?: string
  tags?: TagInput[]
  demo_type?: 'web' | 'zip' | 'link'
  external_url?: string
  prompt?: string
  video_url?: string
  zip_url?: string
  cover_url?: string
  upload_code?: string
  idempotency_key?: string
  force?: boolean
}

export interface UpdateDemoPayload {
  title?: string
  description?: string
  tags?: TagInput[]
  demo_type?: 'web' | 'zip' | 'link'
  external_url?: string
  prompt?: string
  video_url?: string
  cover?: File | null
  file?: File | null
  commit_message?: string
  /** 上传新 zip 时是否保留当前版本为独立旧版页面 */
  keep_old_version?: boolean
}

export interface ForumTopic {
  id: number
  title: string
  content: string
  author: string | null
  author_id: number | null
  demo_slug: string | null
  category: string
  tags: string[]
  pinned: boolean
  sticky: boolean
  status: string
  reply_count: number
  view_count: number
  created_at: string
  updated_at: string
}

export interface ForumReply {
  id: number
  topic_id: number
  author: string | null
  author_id: number | null
  content: string
  status?: string
  created_at: string
}

export interface ForumTopicInput {
  title: string
  content?: string
  demo_slug?: string | null
  category?: string
  tags?: string[]
}

export interface ForumTopicAdminUpdate {
  pinned?: boolean
  sticky?: boolean
  category?: string
  status?: string
}

export interface AdminStats {
  demos: { total: number; approved: number; pending: number; rejected: number }
  users: number
  storage: { oss_enabled: boolean; mode: string; local_demos: number; local_files: number; local_size_bytes: number }
}

export interface Notification {
  id: number
  type: string
  actor: string | null
  actor_id: number | null
  demo_slug: string | null
  topic_id: number | null
  reply_id: number | null
  read: boolean
  created_at: string
}

export interface ForumReport {
  id: number
  target_type: 'topic' | 'reply'
  target_id: number
  reason: string
  status: 'pending' | 'handled' | 'ignored'
  reporter_id: number
  created_at: string
}

export interface ForumReportInput {
  target_type: 'topic' | 'reply'
  target_id: number
  reason: string
}

export interface ForumTopicCard {
  id: number
  title: string
  author: string
  reply_count: number
}

export interface Announcement {
  id: number
  type: 'manual' | 'auto' | 'update' | 'demo_update'
  title: string
  content: string
  demo_slug: string | null
  topic_id?: number | null
  pinned?: boolean
  status?: 'draft' | 'published' | 'offline'
  category?: string
  published_at?: string | null
  expires_at?: string | null
  created_by: number | null
  created_at: string
}

export interface AnnouncementInput {
  title: string
  content?: string
  demo_slug?: string | null
  topic_id?: number | null
  pinned?: boolean
  status?: 'draft' | 'published' | 'offline'
  category?: string
  published_at?: string | null
  expires_at?: string | null
}

/** 站点访问统计（关于本站页） */
export interface VisitStat {
  date: string
  count: number
}
export interface SiteStats {
  today: number
  yesterday: number
  total: number
  /** 近 7 天，按日期升序（旧→新），用于趋势图 */
  last7: VisitStat[]
}

/** OSS 后台同步任务状态 */
export interface OssSyncJob {
  running: boolean
  force: boolean
  total: number
  done: number
  ok: number
  fail: number
  covers_ok: number
  covers_fail: number
  current: string
  last_error: string
  started_at: number | null
  finished_at: number | null
}

/** 赞助榜 */
export interface Sponsor {
  name: string
  amount: string
  message?: string
}
export interface SponsorBoard {
  sponsors: Sponsor[]
  total_amount: string
  updated_at?: string
}

/** 致谢榜 */
export interface ThanksItem {
  name: string
  message?: string
}
export interface ThanksBoard {
  thanks: ThanksItem[]
  updated_at?: string
}

/** 管理端：赞助/致谢记录 */
export interface RecognitionItem {
  id: number
  kind: 'sponsor' | 'thanks'
  name: string
  amount?: number | null
  message?: string
  show_amount: boolean
  sort: number
  active: boolean
}
export interface RecognitionInput {
  kind: 'sponsor' | 'thanks'
  name: string
  amount?: number | null
  message?: string
  show_amount?: boolean
  sort?: number
  active?: boolean
}
