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
  /** v2 D3/§4.5：重要性分层 1 核心 / 2 常用 / 3 扩展 —— 驱动选择器排序与「必选」标记 */
  tier?: number
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
  /** v2：关联模型实体（双写，迁移后返回） */
  models?: ModelBrief[]
  /** v2：关联题目实体 */
  tasks?: DemoTaskBrief[]
}

/** v2：模型实体（demo 序列化内嵌简版） */
export interface ModelBrief {
  id: number
  slug: string
  name: string
  vendor?: string | null
  status: string
  /** Q2：exact / family（知厂商不知型号）/ unknown（完全不知）/ guess（灰测未证实） */
  resolution?: string
  /** 收缩后的社区分（(wsum+m·C)/(v+m)）；零票为 null —— 没证据不等于 0 分 */
  score?: number | null
  /** 该模型作品收到的总票数（判断分数能不能信的证据量） */
  votes?: number
  sample_level?: 'none' | 'low' | 'mid' | 'high'
}

/** v2：题目实体（demo 序列化内嵌简版） */
export interface DemoTaskBrief {
  id: number
  slug: string
  title: string
}

/** v2：模型列表项 */
export interface ModelSummary extends ModelBrief {
  description: string
  demo_count: number
  rating_avg?: number | null
  created_at: string
}

/** v2：模型行为档案的标签值分布（常见类型/常见玩法） */
export interface ModelTagDist {
  value: string
  demos: number
}

/** v2：模型详情（§11 行为档案：统计 + 分布 + 热门任务 + 最近作品） */
export interface ModelDetail extends ModelSummary {
  aliases: string[]
  tasks: { id: number; slug: string; title: string; demo_count: number }[]
  recent_demos: DemoSummary[]
  merged_into?: number | null
  type_dist: ModelTagDist[]
  game_dist: ModelTagDist[]
  /** 全站先验：{C 先验分, m 收缩强度=票数中位数}，供"为什么低票高分排在后面"的验算 */
  prior?: { C: number; m: number }
}

/** v2：题目列表项 */
export interface TaskSummary {
  id: number
  slug: string
  title: string
  description: string
  /** 题面摘录（无描述时取该题下第一件作品的提示词） */
  prompt_excerpt?: string
  category?: string | null
  status: string
  demo_count: number
  created_at: string
}

/** 侧滑"瞄一眼"的紧凑摘要（三种实体共用一个形状，缺字段按 kind 判断） */
export interface PeekResult {
  kind: 'model' | 'task' | 'demo'
  slug: string
  name: string
  description: string
  full_path: string
  demo_count?: number
  vendor?: string | null
  resolution?: string
  status?: string
  score?: number | null
  votes?: number
  sample_level?: string
  is_prompt_excerpt?: boolean
  model_count?: number
  demo_type?: string
  rating_avg?: number | null
  rating_count?: number
  cover_url?: string | null
  models?: ModelBrief[]
  demos?: { slug: string; title: string; rating_avg: number | null; rating_count: number; cover_url: string | null }[]
}

/** 上传页「挂到哪道题」的建议项（规则层 TF-IDF，无 LLM） */
export interface TaskSuggestItem {
  task_id: number
  slug: string
  title: string
  category?: string | null
  demo_count: number
  /** 相似度 0~1 */
  score: number
}

/** 证据表的一行 = 一件作品；列即链条环节（模型 → 题面 → 生成过程 → 评分） */
export interface TaskChainRow {
  slug: string
  title: string
  models: ModelBrief[]
  prompt_id: number | null
  /** null = 该作品未填提示词，一致性未知（既不算一致也不算不一致） */
  same_prompt: boolean | null
  prompt_excerpt: string
  rounds: number | null
  minutes: number | null
  rating_avg: number | null
  rating_count: number
}

export interface TaskChain {
  brief: string
  /** description=作者写的题面；prompt=回落到基准提示词 */
  brief_source: 'description' | 'prompt' | ''
  prompt_id: number | null
  prompt_variants: number
  no_prompt_count: number
  rows: TaskChainRow[]
}

/** v2：题目详情——compare 即 Benchmark 对比行 */
export interface TaskCompareRow {
  model: ModelBrief
  demo_count: number
  avg_rating?: number | null
  /** v2 B5′：平均轮数 / 平均耗时（分钟），未填为 null（不用 0 冒充数据） */
  avg_rounds?: number | null
  avg_minutes?: number | null
  best_demo?: { slug: string; title: string; rating_avg: number } | null
}

export interface TaskDetail extends Omit<TaskSummary, 'demo_count'> {
  demos_total: number
  compare: TaskCompareRow[]
  demos: DemoSummary[]
  /** 链条视图（题面 + 逐作品证据行） */
  chain?: TaskChain | null
}

/** v2 B2′：同提示词的其他作品（prompt_id 精确共享 = 严格复现对比） */
export interface SamePromptResult {
  prompt: string
  prompt_id?: number | null
  items: DemoSummary[]
}

/** v2 D3：探索页聚合数据源（模型 / 题目 / 描述性标签；兜底位折叠为 fallback_demos） */
export interface ExploreResult {
  models: { total: number; items: ModelSummary[]; fallback_demos: number }
  tasks_total: number
  tasks: TaskSummary[]
  tags: Record<string, { value: string; demos: number }[]>
}

/** v2 B3′：prompt 簇 → 待确认题目（管理端「成题」面板的数据源） */
export interface ClusterDemo {
  demo_id: number
  slug: string
  title: string
  models: string[]
  rating_avg: number
  rating_count: number
  covered: boolean
}

export interface PromptCluster {
  kind: 'exact' | 'similar'
  score?: number | null
  demo_count: number
  models: string[]
  distinct_models: number
  covered: boolean
  suggested_title: string
  sample_prompt: string
  demos: ClusterDemo[]
}

export interface PromptClusters {
  exact: PromptCluster[]
  similar: PromptCluster[]
  stats: {
    demos_with_prompt?: number
    unique_prompts?: number
    exact_clusters?: number
    similar_clusters?: number
    thresholds?: { min_score: number; exact_min_demos: number; similar_min_demos: number; similar_min_models: number }
  }
}

/** §4.2 标签建议包：规则从现有词表推出，作者收下或跳过都行 */
export interface DerivedTag {
  key: string
  value: string
  label: string
  confidence: number
  reason: string
  demo_count?: number | null
}

export interface DeriveResult {
  items: DerivedTag[]
  note: string
}

/** B4 合并向导 / 别名中心：管理端实体清单与冲突、合并预览 */
export interface AdminModelList {
  items: ModelSummary[]
  total: number
  status_counts: Record<string, number>
}

export interface AdminTaskList {
  items: (TaskSummary & { merged_into_id?: number | null })[]
  total: number
  page: number
  page_size: number
  status_counts: Record<string, number>
}

export interface MergeEntityRef {
  id: number
  slug?: string
  /** 模型用 name、题目用 title */
  name?: string
  title?: string
}

export interface MergePreview {
  source: MergeEntityRef
  target: MergeEntityRef
  affected_demos: number
  aliases_moved?: number
  merged_demos?: number
  dry_run: boolean
}

export interface ConflictItem {
  id: number
  label: string
  demos: number
}

export interface ConflictGroup {
  key: string
  items: ConflictItem[]
}

export interface EntityConflicts {
  models: ConflictGroup[]
  tasks: ConflictGroup[]
  groups: number
}

/** 撤销合并：merge-history 条目与 unmerge 预览 */
export interface MergeHistoryItem {
  source: MergeEntityRef
  target: MergeEntityRef | null
  moved_total: number
  movable_back: number
  /** false = 早期合并没记 moved_demo_ids，只能恢复实体、无法迁回引用 */
  reliable: boolean
  reason: string
  restored_status: string
}

export interface UnmergePreview {
  source: MergeEntityRef
  target: MergeEntityRef
  moved_total: number
  will_restore: number
  already_moved_away: number
  restored_status: string
  reliable: boolean
  dry_run: boolean
  unmerged?: boolean
}

/** B4 治理体检面板（knowledge_stats 的真实形状：覆盖率/积压/重复率，不用标签数量当指标） */
export interface KnowledgeStats {
  demos_approved: number
  coverage: Record<string, { label: string; tier: number; demos: number; rate: number }>
  model_entity: {
    demos: number
    rate: number
    total_models: number
    active: number
    candidate: number
    unverified: number
    deprecated: number
  }
  task: { total: number; active: number; candidate: number }
  inbox: { pending: number; pending_actionable: Record<string, number> }
  duplicate_slugs: number
}

/** B4 审计浏览 */
export interface AuditEntry {
  id: number
  actor_type: string
  actor_id?: number | null
  /** 后端批量解析出的署名（系统/匿名动作为 actor_type） */
  actor: string
  action: string
  entity_type: string
  entity_id: number
  before?: Record<string, unknown> | string | null
  after?: Record<string, unknown> | string | null
  reason?: string | null
  created_at: string
}

export interface AuditList {
  items: AuditEntry[]
  total: number
  page: number
  page_size: number
  /** 可选动作清单由后端给（前端不硬编码，避免白名单与写入脱节） */
  actions: string[]
  entity_types: string[]
}

/** B4 巡检：一个检查项（level=action 才有可自动执行的补救） */
export interface InspectionCheck {
  id: string
  label: string
  level: 'action' | 'warn' | 'info'
  hint: string
  count: number
  can_queue: boolean
  rate?: number
  fixable?: number
  samples?: Record<string, unknown>[]
}

export interface InspectionResult {
  approved: number
  total_findings: number
  checks: InspectionCheck[]
}

/** type:demo 拆分流水线的预览结果（规则只出建议，批准在收件箱） */
export interface TypeDemoPreview {
  stats: { approved: number; demo_share: number; type_dist: { value: string; demos: number; rate: number }[] }
  scanned: number
  proposed: number
  by_target: Record<string, number>
  samples: {
    demo_slug: string
    demo_title: string
    add: string
    alt?: string[]
    confidence: number
    matched?: string[]
    label_zh?: string
  }[]
}

export interface TypeDemoQueueResult {
  proposed: number
  queued: number
}

/** Q2 第三步：归属工作台 —— 兜底实体及其待归属作品（含规则预填目标） */
export interface AttributionItem {
  id: number
  slug: string
  title: string
  model_hint: string
  rating_avg: number
  rating_count: number
  guess?: { id: number; slug: string; name: string } | null
}

export interface AttributionGroup {
  model: ModelSummary
  demos: AttributionItem[]
}

export interface AttributionPending {
  groups: AttributionGroup[]
  targets: { id: number; slug: string; name: string; vendor?: string | null }[]
}

export interface AttributeResult {
  moved: number
  demo_ids: number[]
  target: { id: number; slug: string; name: string }
}

/** M3-B3 管理端题目详情（任何状态含 merged/hidden + 归属作品全量含 pending/rejected——挂摘 UI 数据源） */
export interface AdminTaskDetail {
  id: number
  slug: string
  title: string
  description: string
  category: string | null
  status: string
  merged_into_id: number | null
  created_at: string
  demos: { id: number; slug: string; title: string; status: string }[]
}
/** v2 B4′：治理收件箱条目（kind/payload 组合，approve 才由 service 执行） */
export interface SuggestionItem {
  id: number
  kind: 'new_model' | 'new_task' | 'task_match' | 'merge_model' | 'merge_task' | 'alias' | 'retag_demo'
  payload: Record<string, unknown>
  confidence?: number | null
  source: 'user' | 'admin' | 'ai' | 'inferred' | 'external' | 'imported'
  status: 'pending' | 'approved' | 'rejected'
  demo_id?: number | null
  ref_id?: number | null
  created_at: string
  reviewed_at?: string | null
  /** 仅 approve 响应里出现：service 实际做了什么（用于提示文案，不入库） */
  result?: string
}

export interface SuggestionList {
  items: SuggestionItem[]
  pending_by_kind: Record<string, number>
  thresholds: { auto_accept: number; review: number }
}

export interface PaginatedModels {
  items: ModelSummary[]
  total: number
  page: number
  page_size: number
}

export interface PaginatedTasks {
  items: TaskSummary[]
  total: number
  page: number
  page_size: number
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
  /** astra 橱窗策展：站点通行证（逗号枚举 deep/astra）+ 语言标记 */
  sites?: string
  lang?: string
}

export interface CurationResult {
  slug: string
  sites: string
  lang: string
}

export interface AdminUser extends User {
  demo_count: number
}

export interface Settings {
  auto_approve: boolean
  /** 未注册（public）上传是否直接放行 */
  auto_approve_public: boolean
  /** 整活模式（纯前端显示层替换）；PUT 时省略 = 保持不变 */
  fun_mode?: boolean | null
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
  /** v2：按模型实体 slug 过滤 */
  model?: string
  /** v2：按题目实体 slug 过滤 */
  task?: string
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
  /** v2 B4′：挑战的题目 slug —— 只生成挂题候选，待管理员确认 */
  task?: string
  /** Q2：选了兜底型号（未标注 / 未定型号 / 灰测）时的依据留痕 */
  model_hint?: string
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
  /** v2 B4′：挑战的题目 slug（只生成挂题候选） */
  task?: string
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
  locked: boolean
  solved: boolean
  status: string
  reply_count: number
  view_count: number
  like_count: number
  thanks_count: number
  my_reactions: string[]
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
  parent_id?: number | null
  like_count?: number
  thanks_count?: number
  my_reactions?: string[]
  created_at: string
  /** 仅管理端全局列表返回：这条回复属于哪个帖子 */
  topic_title?: string | null
}

export interface ForumTopicInput {
  title: string
  content?: string
  demo_slug?: string | null
  category?: string
  tags?: string[]
}

export interface ForumTopicAdminUpdate {
  title?: string
  tags?: string
  pinned?: boolean
  sticky?: boolean
  locked?: boolean
  solved?: boolean
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

export interface ReactionSummary {
  target_type: string
  target_id: number
  like_count: number
  thanks_count: number
  my_reactions: string[]
}

export interface UserProfile {
  id: number
  username: string
  role: string
  status: string
  bio: string
  created_at: string
  reputation: number
  demo_count: number
  topic_count: number
  reply_count: number
  follower_count: number
  following_count: number
  is_following: boolean
  is_self: boolean
}

export interface FollowOut {
  following: boolean
  followers_count: number
  following_count: number
}

/** 用户声望榜行（GET /users/leaderboard，仅 active 用户；与后端 UserLeaderboardOut 对齐） */
export interface UserLeaderboardItem {
  id: number
  username: string
  bio: string
  reputation: number
  received_likes: number
  received_thanks: number
  demo_count: number
  topic_count: number
  reply_count: number
  follower_count: number
}

/** 公开用户信息（GET /users/{u} 与 followers/following 名单行） */
export interface UserPublic {
  id: number
  username: string
  role: string
  status: string
  bio: string
  created_at: string
  demo_count: number
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

/** 站点公开概况（GET /meta/site-info）：内容/社区/流量/热门/能力，60s 缓存 */
export interface SiteInfo {
  site: { name: string; description: string; info_version: number }
  /** 显示层开关（整活模式等）；只影响前端展示文案，不改任何数据 */
  display?: { fun_mode: boolean }
  content: {
    demos_total: number
    demos_by_type: Record<string, number>
    authors_total: number
    uploads_last_7d: number
    tags: { keys: number; values: number }
    forum_topics: number
  }
  community: { users_total: number; users_active_week: number }
  traffic: { pv_today: number; pv_yesterday: number; pv_total: number; online_now: number }
  hot: {
    top_models: Array<{ value: string; demos: number }>
    top_games: Array<{ value: string; demos: number }>
    latest_demo: { slug: string; title: string; created_at: string } | null
  }
  capabilities: {
    upload: { anonymous: boolean; guide: string; tag_keys: string; idempotency: boolean }
    features: Record<string, unknown>
  }
  generated_at: string
}
