from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(ORMModel):
    id: int
    username: str
    role: str
    status: str
    bio: str
    created_at: datetime


class UserPublic(UserOut):
    demo_count: int = 0


class AuthResponse(BaseModel):
    access_token: str
    user: UserOut


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ---------- Tags ----------
class TagRef(BaseModel):
    key: str
    value: str


class TagOut(ORMModel):
    id: int
    key: str
    value: str
    description: str
    parent_id: int | None
    demo_count: int = 0
    child_count: int = 0
    mode: str = "open"


class TagDetail(TagOut):
    parent: TagOut | None = None
    children: list[TagOut] = []


class TagCreate(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    value: str = Field(min_length=1, max_length=128)
    description: str = ""
    group: str | None = Field(default=None, max_length=64)
    parent_id: int | None = None


class TagKeyValueOut(BaseModel):
    id: int
    value: str
    description: str = ""
    demo_count: int = 0
    group: str | None = None  # 固定值分组/厂商（如 DeepSeek、OpenAI）


class TagKeyOut(BaseModel):
    key: str
    mode: str  # fixed | open | int
    label: str
    description: str
    sort: int = 0
    tier: int = 2  # v2 重要性分层：1 核心 / 2 常用 / 3 扩展
    values: list[TagKeyValueOut] = []
    demo_count: int = 0
    min: int | None = None  # int 键：值域下界（供滑条）
    max: int | None = None  # int 键：值域上界（供滑条）


class TagValueSuggestionIn(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    value: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=1000)
    group: str | None = Field(default=None, max_length=64)
    demo_id: int | None = None


class TagValueSuggestionOut(BaseModel):
    id: int
    key: str
    value: str
    description: str = ""
    group: str | None = None
    status: str = "pending"
    demo_id: int | None = None
    created_at: datetime


class TagSuggestionReview(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")
    group: str | None = Field(default=None, max_length=64)


class AiSuggestIn(BaseModel):
    demo_id: int | None = None
    text: str = Field(default="", max_length=4000)


class TagGroupRename(BaseModel):
    new_group: str = Field(min_length=1, max_length=64)


class TagValueGroupSet(BaseModel):
    group: str | None = Field(default=None, max_length=64)


class TagMergeIn(BaseModel):
    from_key: str = Field(min_length=1, max_length=64)
    from_value: str = Field(min_length=1, max_length=128)
    to_key: str = Field(min_length=1, max_length=64)
    to_value: str = Field(min_length=1, max_length=128)
    dry_run: bool = False


class TagMergeResult(BaseModel):
    merged: int = 0          # 已迁移到目标值的引用数
    removed_dups: int = 0    # 因 demo 已有目标值而删除的重复引用数
    affected_demos: int = 0  # 受影响 demo 数（去重后的 demo 数）
    deleted_source: bool = False
    dry_run: bool = False


class TagKeyUpsert(BaseModel):
    key: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    mode: str = Field(pattern="^(fixed|open|int)$")
    label: str = Field(min_length=1, max_length=64)
    description: str = ""
    sort: int = 0


class TagKeyUpdate(BaseModel):
    """更新标签键：不含 key（key 在 URL 路径里）。"""
    mode: str = Field(pattern="^(fixed|open|int)$")
    label: str = Field(min_length=1, max_length=64)
    description: str = ""
    sort: int = 0


# ---------- Demo ----------
class DemoFromUrlIn(BaseModel):
    """AI agent 友好：JSON 提交，zip 走 URL（后端下载），免 multipart。
    可匿名上传（不登录）：作者固定为 public；带 upload_code 视为可信。"""
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    tags: list | None = None
    demo_type: str = "web"  # web | zip | link
    external_url: str | None = None
    prompt: str = ""
    video_url: str | None = None
    zip_url: str | None = None
    file_url: str | None = None  # 单文件（.html/.svg）直传 URL，与 zip_url 二选一
    cover_url: str | None = None
    upload_code: str = ""  # 可选：信任通道密钥（未登录时生效，匹配则直接放行）
    idempotency_key: str = ""  # 可选：8~128 位幂等键；重试带同一 key 不重复创建
    task: str = ""  # 可选（v2 B4′）：挑战的题目 slug；只生成待审候选，不直接挂题
    model_hint: str = Field(default="", max_length=500)  # Q2：选兜底型号时的依据留痕
    force: bool = False  # 可选：仅管理员生效，跳过内容重复校验（force=1 强制上传）


class DemoModelBriefOut(BaseModel):
    """demo 关联的模型实体（v2 新增字段，向后兼容默认空）。"""

    id: int
    slug: str
    name: str
    vendor: str | None = None
    status: str = "active"
    # exact/family/unknown/guess —— 卡片与模型页据此打「未定型号/未标注/canary」徽章
    resolution: str = "exact"


class DemoTaskBriefOut(BaseModel):
    """demo 关联的题目实体（v2 新增字段）。"""

    id: int
    slug: str
    title: str


class DemoSummaryOut(BaseModel):
    slug: str
    title: str
    description: str
    cover_url: str
    author: str | None
    author_id: int | None
    tags: list[TagRef]
    view_count: int
    download_count: int
    comment_count: int
    created_at: datetime
    status: str
    demo_type: str = "web"
    external_url: str | None = None
    rating_avg: float = 0.0
    rating_count: int = 0
    rating_god: int = 0
    rating_ghost: int = 0
    prompt: str = ""
    models: list[DemoModelBriefOut] = []
    tasks: list[DemoTaskBriefOut] = []


class RatingIn(BaseModel):
    score: int = Field(ge=1, le=5)
    device_id: str = Field(default="", max_length=128)


class RatingOut(BaseModel):
    my_score: int | None = None
    avg: float = 0.0
    count: int = 0
    god: int = 0
    ghost: int = 0
    distribution: list[dict] = []  # [{score:1..5, count}] 各档票数，按 score 升序


class DemoTimelineOut(BaseModel):
    id: int
    version_label: str
    message: str
    old_slug: str | None = None
    created_at: datetime


class DemoDetailOut(DemoSummaryOut):
    preview_url: str = ""
    session_log_count: int
    is_author: bool
    prompt: str = ""
    # Q2：选了兜底型号时的依据留痕（没记录/灰测不便说/别人传的/多模型混合 + 自由描述）
    model_hint: str = ""
    video_url: str | None = None
    file_size: int | None = None
    storage_size: int | None = None
    inconsistency: bool = False
    timeline: list[DemoTimelineOut] = []


class AdminDemoOut(DemoDetailOut):
    # 策展字段仅管理面暴露（astra 橱窗）；公开 schema 未声明 → pydantic 自动剥离
    sites: str = "deep"
    lang: str = "zh"


class DemoCurationIn(BaseModel):
    """astra 橱窗策展：给 demo 发放站点通行证 + 语言标记。None = 保持不变。"""

    sites: list[Literal["deep", "astra"]] | None = Field(default=None, min_length=1)
    lang: Literal["zh", "en"] | None = None


class Paginated(BaseModel):
    items: list[DemoSummaryOut]
    total: int
    page: int
    page_size: int


class DemoCreateResult(BaseModel):
    slug: str
    status: str
    created: bool = True  # False = 命中幂等键，返回已有结果（agent 重试去重）


# ---------- Comments ----------
class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    parent_id: int | None = None


class CommentOut(BaseModel):
    id: int
    demo_id: int
    user_id: int | None
    username: str | None
    parent_id: int | None
    content: str
    created_at: datetime
    children: list["CommentOut"] = []


# ---------- Session Logs ----------
class SessionLogOut(ORMModel):
    id: int
    filename: str
    file_size: int
    created_at: datetime


# ---------- Settings ----------
class SettingsOut(BaseModel):
    auto_approve: bool = True
    auto_approve_public: bool = False
    # 整活模式；PUT 时 None = 保持不变（旧调用方漏带字段不会静默关闭）
    fun_mode: bool | None = None


# ---------- 赞助/致谢 ----------
class RecognitionIn(BaseModel):
    kind: str = Field(pattern="^(sponsor|thanks)$")
    name: str = Field(min_length=1, max_length=64)
    amount: int | None = Field(default=None, ge=0)
    message: str = Field(default="", max_length=200)
    show_amount: bool = True
    sort: int = 0
    active: bool = True


# ---------- Admin ----------
class AdminUserOut(UserPublic):
    pass


class ReviewAction(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")


class UserPatch(BaseModel):
    role: str | None = Field(default=None, pattern="^(user|admin)$")
    status: str | None = Field(default=None, pattern="^(active|suspended|deleted)$")


class DemoCounts(BaseModel):
    total: int
    approved: int
    pending: int
    rejected: int


class StorageStatusOut(BaseModel):
    oss_enabled: bool
    mode: str  # oss | oss_backup | local
    local_demos: int
    local_files: int
    local_size_bytes: int


class AdminStatsOut(BaseModel):
    demos: DemoCounts
    users: int
    storage: StorageStatusOut


# ---------- Announcements ----------
class AnnouncementOut(ORMModel):
    id: int
    type: str  # manual | auto | update | demo_update
    title: str
    content: str
    demo_slug: str | None = None
    pinned: bool = False
    status: str = "published"  # draft | published | offline
    category: str = "general"  # general | system | demo | ...
    published_at: datetime | None = None
    expires_at: datetime | None = None
    topic_id: int | None = None
    topic_title: str | None = None
    created_by: int | None = None
    created_at: datetime


class AnnouncementUpsert(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""
    demo_slug: str | None = None
    pinned: bool = False
    status: str = Field(default="published", pattern="^(draft|published|offline)$")
    category: str = Field(default="general", max_length=32)
    published_at: datetime | None = None
    expires_at: datetime | None = None
    topic_id: int | None = None


# ---------- 作品 meta（富卡片） ----------
class DemoMetaOut(BaseModel):
    slug: str
    title: str
    cover_url: str
    author: str


class SamePromptOut(BaseModel):
    """同提示词的其他作品（v2 B2′）：prompt_id 精确共享 = 严格复现对比。

    与 Task 构成粗细两档：同 prompt = 同一句话交给不同模型；同 task = 同一题材。
    本模块零 Task 依赖，是 v2 第一个用户可见的价值。
    """

    prompt: str = ""
    prompt_id: int | None = None
    items: list["DemoSummaryOut"] = []


# ---------- 论坛 ----------
class ForumTopicOut(BaseModel):
    id: int
    title: str
    content: str = ""
    author: str | None = None
    author_id: int | None = None
    demo_slug: str | None = None
    category: str = "general"
    tags: list[str] = []
    pinned: bool = False
    sticky: bool = False
    locked: bool = False
    solved: bool = False
    status: str = "normal"
    reply_count: int = 0
    view_count: int = 0
    like_count: int = 0
    thanks_count: int = 0
    my_reactions: list[str] = []
    created_at: datetime
    updated_at: datetime


class ForumTopicPage(BaseModel):
    items: list[ForumTopicOut]
    total: int
    page: int
    page_size: int



class ForumReplyOut(BaseModel):
    id: int
    topic_id: int
    author: str | None = None
    author_id: int | None = None
    content: str
    status: str = "normal"
    parent_id: int | None = None
    like_count: int = 0
    thanks_count: int = 0
    my_reactions: list[str] = []
    created_at: datetime
    # 仅管理端全局列表填充：跨主题的回复必须知道属于哪个帖子
    topic_title: str | None = None


class ForumReplyPage(BaseModel):
    items: list[ForumReplyOut]
    total: int
    page: int
    page_size: int


class ForumTopicIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=20000)
    demo_slug: str | None = Field(default=None, max_length=128)
    category: str = Field(default="general", max_length=32)
    tags: str = Field(default="", max_length=200)  # 逗号分隔


class ForumReplyIn(BaseModel):
    content: str = Field(min_length=1, max_length=10000)
    parent_id: int | None = None


class ForumTopicAdminUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    tags: str | None = Field(default=None, max_length=200)
    pinned: bool | None = None
    sticky: bool | None = None
    locked: bool | None = None
    solved: bool | None = None
    category: str | None = Field(default=None, max_length=32)
    status: str | None = Field(default=None, pattern="^(normal|hidden|reviewing)$")


class ForumReviewIn(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")


class ForumReportIn(BaseModel):
    target_type: str = Field(pattern="^(topic|reply)$")
    target_id: int
    reason: str = Field(min_length=1, max_length=500)


class ForumReportOut(BaseModel):
    id: int
    target_type: str
    target_id: int
    reporter_id: int | None = None
    reason: str = ""
    status: str = "open"
    created_at: datetime


class ForumReportHandleIn(BaseModel):
    action: str = Field(pattern="^(resolve|dismiss)$")


# ---------- 社区互动 ----------
class ReactionToggleIn(BaseModel):
    target_type: str = Field(pattern="^(topic|reply)$")
    target_id: int
    reaction_type: str = Field(pattern="^(like|thanks)$")


class ReactionSummary(BaseModel):
    target_type: str
    target_id: int
    like_count: int = 0
    thanks_count: int = 0
    my_reactions: list[str] = []


class ReactionToggleOut(ReactionSummary):
    active: bool = False


class FollowOut(BaseModel):
    following: bool
    followers_count: int = 0
    following_count: int = 0


class UserProfileOut(BaseModel):
    id: int
    username: str
    role: str
    status: str
    bio: str
    created_at: datetime
    reputation: int = 0
    demo_count: int = 0
    topic_count: int = 0
    reply_count: int = 0
    follower_count: int = 0
    following_count: int = 0
    is_following: bool = False
    is_self: bool = False


class UserLeaderboardOut(BaseModel):
    id: int
    username: str
    bio: str = ""
    reputation: int = 0
    received_likes: int = 0
    received_thanks: int = 0
    demo_count: int = 0
    topic_count: int = 0
    reply_count: int = 0
    follower_count: int = 0


class UserLeaderboardPage(BaseModel):
    items: list[UserLeaderboardOut]
    total: int
    page: int
    page_size: int


# ---------- 通知 ----------
class NotificationOut(BaseModel):
    id: int
    type: str
    actor: str | None = None
    actor_id: int | None = None
    demo_slug: str | None = None
    topic_id: int | None = None
    reply_id: int | None = None
    read: bool = False
    created_at: datetime


class NotificationReadIn(BaseModel):
    id: int


class UnreadCountOut(BaseModel):
    count: int = 0

# ---------- v2 实体：Model / Task / Explore ----------


class ModelSummaryOut(BaseModel):
    id: int
    slug: str
    name: str
    vendor: str | None = None
    status: str = "active"
    resolution: str = "exact"
    description: str = ""
    demo_count: int = 0
    rating_avg: float | None = None  # 等权均分（旧语义，保留兼容）
    # 收缩后的社区分 = (票数加权和 + m·C)/(票数 + m)；零票为 None（没证据 ≠ 0 分）
    score: float | None = None
    votes: int = 0
    sample_level: str = "none"  # none | low | mid | high
    created_at: datetime


class ModelListOut(BaseModel):
    items: list[ModelSummaryOut]
    total: int
    page: int
    page_size: int


class ModelTaskRefOut(BaseModel):
    id: int
    slug: str
    title: str
    demo_count: int = 0


class ModelTagDistOut(BaseModel):
    """模型行为档案：某标签键的值分布（常见类型/常见玩法）。"""

    value: str
    demos: int


class ModelDetailOut(ModelSummaryOut):
    aliases: list[str] = []
    tasks: list[ModelTaskRefOut] = []
    recent_demos: list["DemoSummaryOut"] = []
    merged_into: int | None = None
    type_dist: list[ModelTagDistOut] = []
    game_dist: list[ModelTagDistOut] = []
    # 先验透明化：{C, m} 一起给出，读者能自己验算"为什么 6 票的 4.9 排在 412 票的 4.6 后面"
    prior: dict = Field(default_factory=dict)


class ModelBriefOut(BaseModel):
    id: int
    slug: str
    name: str
    vendor: str | None = None
    status: str = "active"


class CompareBestDemoOut(BaseModel):
    slug: str
    title: str
    rating_avg: float = 0.0


class CompareRowOut(BaseModel):
    model: ModelBriefOut
    demo_count: int = 0
    avg_rating: float | None = None
    # v2 B5′：run 元数据两指标（未填者不参与 AVG，返回 None 而不是 0）
    avg_rounds: float | None = None
    avg_minutes: float | None = None
    best_demo: CompareBestDemoOut | None = None


class TaskSummaryOut(BaseModel):
    id: int
    slug: str
    title: str
    description: str = ""
    # 题面摘录：无描述时取该题下第一件作品的提示词（列表页要能看懂题目是什么）
    prompt_excerpt: str = ""
    category: str | None = None
    status: str = "active"
    demo_count: int = 0
    created_at: datetime


class TaskListOut(BaseModel):
    items: list[TaskSummaryOut]
    total: int
    page: int
    page_size: int


class TaskChainRowOut(BaseModel):
    """证据表的一行 = 一件作品，列即链条环节（模型 → 题面 → 生成过程 → 评分）。"""

    slug: str
    title: str
    models: list[ModelBriefOut] = []
    prompt_id: int | None = None
    # None = 该作品未填提示词，一致性未知（既不算一致也不算不一致）
    same_prompt: bool | None = None
    prompt_excerpt: str = ""
    rounds: int | None = None
    minutes: int | None = None
    rating_avg: float | None = None
    rating_count: int = 0


class TaskChainOut(BaseModel):
    brief: str = ""
    # description=作者写的题面；prompt=回落到基准提示词（必须标注，不冒充作者描述）
    brief_source: str = ""
    prompt_id: int | None = None
    prompt_variants: int = 0
    no_prompt_count: int = 0
    rows: list[TaskChainRowOut] = []


class TaskDetailOut(BaseModel):
    id: int
    slug: str
    title: str
    description: str = ""
    category: str | None = None
    status: str = "active"
    demos_total: int = 0
    compare: list[CompareRowOut] = []
    demos: list["DemoSummaryOut"] = []
    # 链条视图（题目页主形态）：题面 + 逐作品的证据行
    chain: TaskChainOut | None = None
    created_at: datetime


class TaskSuggestItemOut(BaseModel):
    task_id: int
    # 只有 id 的建议没法显示 —— 补齐可读字段（上传页挂题选择器用）
    slug: str
    title: str
    category: str | None = None
    demo_count: int = 0
    score: float


class ExploreGroupOut(BaseModel):
    total: int = 0
    items: list[ModelSummaryOut] = []
    # 兜底位作品数（未定型号/未标注/灰测），前端渲染为「其他 · 未定 N」折叠行
    fallback_demos: int = 0


class ExploreTagValuesOut(BaseModel):
    value: str
    demos: int


class ExploreOut(BaseModel):
    models: ExploreGroupOut
    tasks_total: int = 0
    tasks: list[TaskSummaryOut] = []
    tags: dict[str, list[ExploreTagValuesOut]] = {}


# ---------- v2 B1.5：治理写接口请求体（admin only） ----------


class ModelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    vendor: str | None = Field(default=None, max_length=64)
    description: str = Field(default="", max_length=1000)
    status: str = Field(default="active", pattern="^(candidate|active|unverified|deprecated)$")


class ModelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    vendor: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=1000)
    # 改 slug：ASCII 安全值，旧 slug 自动转为别名（匹配层继续认，但对外链接会变）
    slug: str | None = Field(default=None, min_length=1, max_length=100)


class ModelStatusIn(BaseModel):
    status: str = Field(pattern="^(candidate|active|unverified|deprecated)$")
    reason: str = Field(default="", max_length=500)


class DeriveIn(BaseModel):
    """标签建议包的输入：作者已经写下的那几样东西。"""

    title: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=4000)
    prompt: str = Field(default="", max_length=8000)
    limit: int = Field(default=8, ge=1, le=20)


class DeriveItemOut(BaseModel):
    key: str
    value: str
    label: str = ""
    confidence: float = 0.0
    reason: str = ""
    demo_count: int | None = None


class DeriveOut(BaseModel):
    items: list[DeriveItemOut] = []
    note: str = ""


class AliasIn(BaseModel):
    alias: str = Field(min_length=1, max_length=128)


class MergeIn(BaseModel):
    """合并请求（model / task 同构）：dry_run=True 先预览影响面，确认后才真合。"""

    target_id: int
    dry_run: bool = False
    reason: str = Field(default="", max_length=500)


class UnmergeIn(BaseModel):
    """撤销合并：dry_run=True 先看能迁回多少（合并后可能又做过归属，必须预览）。"""

    dry_run: bool = False
    reason: str = Field(default="", max_length=500)


class TaskCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    category: str | None = Field(default=None, max_length=64)
    status: str = Field(default="active", pattern="^(candidate|active|merged|hidden)$")
    # 建题即挂题（prompt 簇「成题」一次点击完成：新建 + 批量挂载）
    demo_ids: list[int] = Field(default_factory=list, max_length=500)


class TaskUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, pattern="^(candidate|active|merged|hidden)$")


class AttachDemosIn(BaseModel):
    demo_ids: list[int] = Field(min_length=1, max_length=500)


class AttributeIn(BaseModel):
    """归属工作台：把作品从兜底位迁到真实型号。"""

    demo_ids: list[int] = Field(min_length=1, max_length=200)
    target_id: int
    reason: str = Field(default="", max_length=500)


class SuggestionReviewIn(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")
