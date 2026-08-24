from datetime import datetime

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
    force: bool = False  # 可选：仅管理员生效，跳过内容重复校验（force=1 强制上传）


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
    video_url: str | None = None
    file_size: int | None = None
    storage_size: int | None = None
    inconsistency: bool = False
    timeline: list[DemoTimelineOut] = []


class AdminDemoOut(DemoDetailOut):
    pass


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


# ---------- Announcements ----------
class AnnouncementOut(ORMModel):
    id: int
    type: str  # manual | auto | update | demo_update
    title: str
    content: str
    demo_slug: str | None = None
    created_by: int | None = None
    created_at: datetime


class AnnouncementUpsert(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""
    demo_slug: str | None = None
