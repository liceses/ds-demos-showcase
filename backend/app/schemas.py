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


class TagDetail(TagOut):
    parent: TagOut | None = None
    children: list[TagOut] = []


class TagCreate(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    value: str = Field(min_length=1, max_length=128)
    description: str = ""
    parent_id: int | None = None


# ---------- Demo ----------
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


class DemoDetailOut(DemoSummaryOut):
    session_log_count: int
    commit_count: int
    is_author: bool
    file_size: int | None = None
    storage_size: int | None = None
    inconsistency: bool = False


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


# ---------- Git ----------
class CommitInfoOut(BaseModel):
    hash_short: str
    message: str
    author: str
    date: str


class CommitFileOut(BaseModel):
    path: str
    status: str
    additions: int
    deletions: int


class CommitDetailOut(BaseModel):
    hash: str
    message: str
    author: str
    date: str
    files: list[CommitFileOut]
    diff_text: str


# ---------- Settings ----------
class SettingsOut(BaseModel):
    auto_approve: bool


# ---------- Admin ----------
class AdminUserOut(UserPublic):
    pass


class ReviewAction(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")


class UserPatch(BaseModel):
    role: str | None = Field(default=None, pattern="^(user|admin)$")
    status: str | None = Field(default=None, pattern="^(active|suspended|deleted)$")
