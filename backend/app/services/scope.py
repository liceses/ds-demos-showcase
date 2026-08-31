"""多站可见域（astra 橱窗）：Host → scope 判定 + 数据面按可见域过滤的单一实现。

设计原则（决策见 docs/astra橱窗分离.md）：
- deep（deepdemos 等一切域名）= 现状视区：所有存量 demo 的 sites 默认含 'deep'，
  过滤条件恒真，deep 域行为逐字节不变。
- astra（astrademos.top 及其子域）= 严格只读橱窗：
  ① API 白名单之外的路径（论坛/评论/登录/上传/docs/…）一律 404；
  ② 数据面只放行 sites 含 'astra' 的策展作品（列表/详情/预览）；
  ③ 输出层作者统一 "astra lab"、过滤内部标签——只改响应形态，不改任何存储数据。
- current_scope 上下文变量由 main.py 的 middleware 设定：serializer 等非路由调用点
  也能读到当前请求视区（FastAPI 端点与下游 task 继承 contextvar）。
"""

import contextvars
import threading
import time

from fastapi import Request

from ..config import settings

DEEP = "deep"
ASTRA = "astra"
VALID_SCOPES = (DEEP, ASTRA)

# 当前请求视区；非请求场景（脚本/后台任务）默认 deep = 全量口径
current_scope: contextvars.ContextVar[str] = contextvars.ContextVar("current_scope", default=DEEP)


def astra_hosts() -> list[str]:
    return [h.strip().lower().lstrip(".") for h in settings.astra_hosts.split(",") if h.strip()]


def resolve_scope(request: Request) -> str:
    """按 Host 头判定请求视区（精确域或子域命中 astra_hosts 即为 astra）。"""
    host = (request.headers.get("host") or "").split(":")[0].strip(".").lower()
    for h in astra_hosts():
        if host == h or host.endswith("." + h):
            return ASTRA
    return DEEP


def get_scope(request: Request) -> str:
    """路由依赖入口：优先取 middleware 预设值，缺省现算兜底。"""
    scope = getattr(request.state, "scope", None)
    return scope if scope in VALID_SCOPES else resolve_scope(request)


def scope_contains_filter(scope: str):
    """demos 查询的 SQL 条件：sites（逗号分隔枚举 'deep' / 'astra' / 'deep,astra'）含当前视区。"""
    from ..models import Demo

    return Demo.sites.contains(scope)


def demo_in_scope(demo, scope: str) -> bool:
    """行级判定（详情/下载/预览门禁用）：astra 视区还要求已上架。"""
    if demo is None:
        return False
    if scope not in (demo.sites or "").split(","):
        return False
    if scope == ASTRA and demo.status != "approved":
        return False
    return True


def slug_in_astra(slug: str) -> bool:
    """（兼容保留）astra 视区预览门禁。"""
    return demo_public_in_scope(slug, ASTRA)


# ---- 预览门禁缓存：预览子资源（js/css/图片）逐文件请求，60s TTL 免每请求打库 ----
_VIS_TTL = 60.0
_vis_lock = threading.Lock()
_vis_cache: dict[str, tuple[float, str, str]] = {}  # slug -> (过期时刻, sites, status)


def invalidate_visibility(slug: str) -> None:
    """策展变更后清缓存（管理端改 sites 立即生效，不必等 TTL）。"""
    with _vis_lock:
        _vis_cache.pop(slug, None)


def demo_public_in_scope(slug: str, scope: str) -> bool:
    """预览/下载等公开出口的门禁：slug 属于给定视区才可出。
    astra 域额外要求已上架；deep 域只查 sites（存量行默认含 'deep' → 行为不变）。"""
    now = time.time()
    with _vis_lock:
        hit = _vis_cache.get(slug)
        row = (hit[1], hit[2]) if hit and hit[0] > now else None
    if row is None:
        from ..database import SessionLocal
        from ..models import Demo

        db = SessionLocal()
        try:
            d = db.query(Demo).filter(Demo.slug == slug).first()
            row = (d.sites or "", d.status or "") if d else ("", "")
        finally:
            db.close()
        with _vis_lock:
            _vis_cache[slug] = (time.time() + _VIS_TTL, row[0], row[1])
    sites, status = row
    if scope not in sites.split(","):
        return False
    if scope == ASTRA and status != "approved":
        return False
    return True


# ---- astra 橱窗 API 白名单（GET-only，其余路径 404）----
# 白名单制而非黑名单：新增路由默认对 astra 不可见，防止漏堵。
ASTRA_ALLOW_EXACT = {
    "/api/v1/demos",
    "/api/v1/meta/site-info",
    "/api/v1/health",
}
ASTRA_ALLOW_PREFIX = (
    "/api/v1/demos/",  # 详情/下载；子路径在 DENY 里精确剔除
    "/preview/",
    "/media/",
)
# 前缀放行后仍需剔除的子资源（astra 极简页不消费，且会漏内容面信息）
ASTRA_DENY_SEGMENTS = ("/related", "/session-logs", "/meta")


def astra_path_allowed(method: str, path: str) -> bool:
    if method != "GET":
        return False
    if path in ASTRA_ALLOW_EXACT:
        return True
    if not any(path.startswith(p) for p in ASTRA_ALLOW_PREFIX):
        return False
    return not any(seg in path for seg in ASTRA_DENY_SEGMENTS)
