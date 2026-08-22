from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role: Mapped[str] = mapped_column(String(16), default="user", nullable=False)  # user | admin
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)  # active | suspended | deleted
    bio: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    demos: Mapped[list["Demo"]] = relationship(back_populates="author")
    comments: Mapped[list["Comment"]] = relationship(back_populates="user")


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("key", "value", name="uq_tag_key_value"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    value: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("tags.id"), nullable=True, index=True)

    parent: Mapped["Tag | None"] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["Tag"]] = relationship(back_populates="parent", cascade="all, delete-orphan")

    demo_associations: Mapped[list["DemoTag"]] = relationship(back_populates="tag", cascade="all, delete-orphan")


class TagKey(Base):
    """标签键定义：决定该 key 下 value 的填写方式。

    mode:
      - fixed: 固定值（管理员维护，用户只能选择，如 model:dsv4-flash）
      - open:  开放值（key 固定，用户自定义 value，如 game:mc）
      - int:   数字值（key 固定，value 必须是整数，如 rounds:3）
    """

    __tablename__ = "tag_keys"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    mode: Mapped[str] = mapped_column(String(16), default="open", nullable=False)
    label: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    description: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
    sort: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Demo(Base):
    __tablename__ = "demos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    cover_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    # web=网页应用 zip=文件包 link=外部链接
    demo_type: Mapped[str] = mapped_column(String(16), default="web", nullable=False, index=True)
    external_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    prompt: Mapped[str] = mapped_column(Text, default="", nullable=False)  # 第一轮提示词
    video_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)  # 介绍视频链接（不存视频）
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False, index=True)  # pending | approved | rejected
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    download_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    # 匿名（未注册）上传的展示名；author_id 为 NULL 时生效（虚拟 public 身份）
    guest_name: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # 幂等键：agent 重试去重（非空唯一）
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True, index=True)
    # zip 内容哈希（sha256，按作者去重，普通索引）
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # 评分冗余统计列（榜单排序用，随评分事务更新）
    rating_sum: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_avg: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    rating_god: Mapped[int] = mapped_column(Integer, default=0, nullable=False)    # score == 5 神作
    rating_ghost: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # score == 1 鬼作
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    author: Mapped["User | None"] = relationship(back_populates="demos")
    tag_associations: Mapped[list["DemoTag"]] = relationship(back_populates="demo", cascade="all, delete-orphan")
    comments: Mapped[list["Comment"]] = relationship(back_populates="demo", cascade="all, delete-orphan")
    session_logs: Mapped[list["SessionLog"]] = relationship(back_populates="demo", cascade="all, delete-orphan")
    ratings: Mapped[list["DemoRating"]] = relationship(back_populates="demo", cascade="all, delete-orphan")
    timeline: Mapped[list["DemoTimeline"]] = relationship(back_populates="demo", cascade="all, delete-orphan")


class DemoTag(Base):
    __tablename__ = "demo_tags"

    demo_id: Mapped[int] = mapped_column(ForeignKey("demos.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

    demo: Mapped["Demo"] = relationship(back_populates="tag_associations")
    tag: Mapped["Tag"] = relationship(back_populates="demo_associations")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    demo_id: Mapped[int] = mapped_column(ForeignKey("demos.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("comments.id"), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    demo: Mapped["Demo"] = relationship(back_populates="comments")
    user: Mapped["User | None"] = relationship(back_populates="comments")
    parent: Mapped["Comment | None"] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["Comment"]] = relationship(back_populates="parent", cascade="all, delete-orphan")


class SessionLog(Base):
    __tablename__ = "session_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    demo_id: Mapped[int] = mapped_column(ForeignKey("demos.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    demo: Mapped["Demo"] = relationship(back_populates="session_logs")


class DemoTimeline(Base):
    """轻量版本时间线（不依赖 git）：记录 demo 的创建/更新历史。"""

    __tablename__ = "demo_timeline"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    demo_id: Mapped[int] = mapped_column(ForeignKey("demos.id", ondelete="CASCADE"), nullable=False, index=True)
    version_label: Mapped[str] = mapped_column(String(32), default="v1", nullable=False)
    message: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    # 若本次更新保留了旧版本，这里指向旧版本 demo 的 slug（可点击跳转）
    old_slug: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    demo: Mapped["Demo"] = relationship(back_populates="timeline")


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(500), nullable=False)


class VisitDaily(Base):
    """站点访问统计：按「天 + IP 去重」；ips 存当天已计的访客 IP（JSON 数组）。"""

    __tablename__ = "visit_daily"

    date: Mapped[str] = mapped_column(String(10), primary_key=True)  # YYYY-MM-DD
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ips: Mapped[str] = mapped_column(Text, default="[]", nullable=False)


class Acknowledgment(Base):
    """赞助 / 致谢榜：单表，kind 区分（sponsor / thanks）。"""

    __tablename__ = "acknowledgments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(16), default="sponsor", nullable=False, index=True)  # sponsor | thanks
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 仅 sponsor
    message: Mapped[str] = mapped_column(String(200), default="", nullable=False)  # 备注/致谢语
    show_amount: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)  # sponsor 是否公开金额
    sort: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)  # 软下架
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class DemoRating(Base):
    """用户评分：1~5 分（5=神作，1=鬼作）。登录 user:{id}；匿名 anon:{sha256}。"""

    __tablename__ = "demo_ratings"
    __table_args__ = (UniqueConstraint("demo_id", "rater_key", name="uq_demo_rater"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    demo_id: Mapped[int] = mapped_column(ForeignKey("demos.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    rater_key: Mapped[str] = mapped_column(String(128), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)  # 1~5
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    demo: Mapped["Demo"] = relationship(back_populates="ratings")


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # manual=手动公告 auto=新 demo 自动公告 update=更新公告（内容为 commit 信息）
    type: Mapped[str] = mapped_column(String(16), default="manual", nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    demo_slug: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    creator: Mapped["User | None"] = relationship()
