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

export interface DemoDetail extends DemoSummary {
  session_log_count: number
  commit_count: number
  is_author: boolean
  file_size?: number
  storage_size?: number
  inconsistency?: boolean
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
}
