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
  previewUrl?: string
  session_log_count: number
  commit_count: number
  is_author: boolean
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
}

export interface AuthResponse {
  access_token: string
  user: User
}

export interface DemoListParams {
  status?: string
  tags?: string[]
  q?: string
  sort?: 'newest' | 'popular'
  page?: number
  page_size?: number
}

export interface CreateDemoPayload {
  title: string
  description?: string
  tags?: string[]
  cover?: File | null
  file: File
}

export interface UpdateDemoPayload {
  title?: string
  description?: string
  tags?: string[]
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
