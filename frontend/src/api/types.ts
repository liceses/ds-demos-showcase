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
  value: string
  description: string
  demo_count: number
}

export interface TagKeyInfo {
  key: string
  mode: 'fixed' | 'open' | 'int'
  label: string
  description: string
  sort: number
  values: TagKeyValue[]
  demo_count: number
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
  commit_count: number
  is_author: boolean
  /** 第一轮提示词 */
  prompt?: string
  /** 介绍视频链接（服务器不存视频） */
  video_url?: string | null
  file_size?: number
  storage_size?: number
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

export interface CommitInfo {
  hash_short: string
  message: string
  author: string
  date: string
}

export interface CommitFile {
  path: string
  status: string
  additions: number
  deletions: number
}

export interface CommitDetail {
  hash: string
  message: string
  author: string
  date: string
  files: CommitFile[]
  diff_text: string
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
  sort?: 'newest' | 'popular' | 'random'
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

export interface Announcement {
  id: number
  type: 'manual' | 'auto' | 'update' | 'demo_update'
  title: string
  content: string
  demo_slug: string | null
  created_by: number | null
  created_at: string
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
