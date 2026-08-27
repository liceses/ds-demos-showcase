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
