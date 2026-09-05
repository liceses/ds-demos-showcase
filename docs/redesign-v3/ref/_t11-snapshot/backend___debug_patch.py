import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = "sqlite:///" + _tmp.replace("\\", "/") + "/t.db"
os.environ["STORAGE_DIR"] = _tmp.replace("\\", "/")
os.environ["JWT_SECRET"] = "test-secret"
os.environ["OSS_ENABLED"] = "false"
os.environ["AUTO_APPROVE"] = "true"

from fastapi.testclient import TestClient

from app.main import app

with TestClient(app) as c:
    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    h = {"Authorization": "Bearer " + r.json()["access_token"]}
    data = {"title": "PATCH调试", "description": "调试", "demo_type": "web", "prompt": "p", "tags": '["model:dsv4-flash"]'}
    body = b"<!doctype html><html><body>" + os.urandom(8).hex().encode() + b"</body></html>"
    r = c.post("/api/v1/demos", data=data, files={"file": ("index.html", body, "text/html")})
    print("upload:", r.status_code, r.json().get("slug"))
    slug = r.json()["slug"]
    g = c.get("/api/v1/models/" + slug)
    print("GET model by slug:", g.status_code, list(g.json().keys())[:6] if g.status_code == 200 else g.text[:100])
    m = g.json()
    print("model id:", m.get("id"), "name:", m.get("name"))
    p = c.patch("/api/v1/admin/entities/model/dsv4-flash", json={"description": "x"}, headers=h)
    print("PATCH by slug:", p.status_code, p.text[:120])
    p2 = c.patch("/api/v1/admin/entities/model/" + str(m.get("id")), json={"description": "x"}, headers=h)
    print("PATCH by id:", p2.status_code, p2.text[:120])