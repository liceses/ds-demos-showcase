"""pytest 夹具：使用临时 SQLite，TestClient 触发 init_db（建表/seed admin/首帖）。

注意：必须在导入 app 之前设置环境变量，否则 module 级 engine 会指向真实库。
"""

import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp(prefix="dsh_test_")
_db_path = os.path.join(_tmp, "test.db").replace("\\", "/")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["STORAGE_DIR"] = os.path.join(_tmp, "storage").replace("\\", "/")
os.environ["JWT_SECRET"] = "test-secret"
os.environ["OSS_ENABLED"] = "false"
os.environ["AUTO_APPROVE"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def admin_headers(client):
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def auth_headers(client):
    """返回一个工厂：调用得到 (headers, username)。每次注册新用户。"""
    import os as _os

    def _make(username: str | None = None):
        name = username or f"u{_os.urandom(4).hex()}"
        pw = "password123"
        r = client.post("/api/v1/auth/register", json={"username": name, "password": pw})
        assert r.status_code == 201, r.text
        login = client.post("/api/v1/auth/login", json={"username": name, "password": pw})
        assert login.status_code == 200, login.text
        return {"Authorization": f"Bearer {login.json()['access_token']}"}, name

    return _make


def _reset_inmemory_state() -> None:
    """清空进程内的限流计数器与派生缓存。

    为什么必须做（KB-9）：限流器以 IP 为键常驻进程，而 client 是 session 级、
    TestClient 的 IP 恒为 "testclient" —— 不清空时「匿名上传 20 次/小时」会被前面用例
    吃掉，整包跑必挂（实测 7 failed，全是 429）。派生缓存同理：别名/聚类/可见域缓存
    跨用例复用会读到上一个用例的数据。
    """
    from app.routers import demos as _demos
    from app.routers import forum as _forum
    from app.routers import ratings as _ratings
    from app.routers import sessions as _sessions
    from app.routers import stats as _stats
    from app.routers import tags as _tags
    from app.services import cluster_service, matching_service, scope as _scope, visits as _visits

    for bucket in (
        _demos._anon_uploads,
        _forum._hits,
        _ratings._anon_demo_hits,
        _ratings._anon_global_hits,
        _sessions._hits,
        _stats._visit_hits,
        _stats._heartbeat_hits,
        _tags._suggest_hits,
    ):
        bucket.clear()
    _visits._recent_hits.clear()
    _visits._online.clear()
    _demos._RELATED_CACHE.clear()
    _demos._RANDOM_CACHE.clear()
    _scope._vis_cache.clear()
    matching_service.invalidate_alias_cache()
    cluster_service.invalidate()


@pytest.fixture(autouse=True)
def _isolate_inmemory_state():
    _reset_inmemory_state()
    yield
    _reset_inmemory_state()
