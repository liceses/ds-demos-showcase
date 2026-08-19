# DS 民间科研成果展示 —— 后端

FastAPI 后端，为前端提供 `/api/v1` REST API、`/preview/{slug}/...` 静态预览和 `/media/...` 媒体文件。

## 快速开始

```bash
cd web/backend

# 安装依赖（建议虚拟环境；Windows 中文路径下 venv 可能有问题，可直接 user 安装）
python -m pip install -r requirements.txt

# 启动（默认 0.0.0.0:8000）
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

首次启动自动建表并写入初始数据：
- 管理员：`admin / admin123`
- 初始标签：`model:dsv4*`、`plugin:routing-suite`、`skills:J-space`、`preset:router-standard`、`type:*`

## 配置

复制 `.env.example` 为 `.env` 后修改：

| 变量 | 说明 | 默认 |
|---|---|---|
| `DATABASE_URL` | 数据库连接 | `sqlite:///./data/app.db` |
| `STORAGE_DIR` | 文件存储目录 | `./storage` |
| `JWT_SECRET` | JWT 密钥 | 请修改 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | token 有效期 | 10080 |
| `AUTO_APPROVE` | 新 demo 是否自动通过 | `true` |
| `MAX_UPLOAD_SIZE` | 上传总大小上限 | 209715200 |
| `MAX_FILE_SIZE` | 单文件上限 | 209715200 |

## 目录

```
app/
├── main.py          # FastAPI 入口、静态预览、初始化
├── config.py        # 配置
├── database.py      # SQLAlchemy
├── models.py        # ORM 模型
├── schemas.py       # Pydantic 模型
├── security.py      # 密码/JWT/Cookie
├── deps.py          # 当前用户依赖
├── serializers.py   # Demo/Tag 序列化
├── routers/         # API 路由
└── services/        # 存储、OSS、设置
```

## 与前端联调

- 前端 dev 代理已指向 `http://localhost:8000`。
- 前端 `.env` 设置 `VITE_USE_MOCK=false` 后使用真实后端。

## 部署

当前生产为 **Docker Compose + nginx**（见仓库根 `docker-compose.yml` 与 `../DEPLOY.md`）：

- `backend/Dockerfile`：`python:3.12-slim` + `uvicorn app.main:app --workers 1`。
- 数据库 SQLite（volume `demo-data`）；文件存本地（volume `demo-storage`）。
- 由 nginx 反代 `/api`、`/preview`、`/media`。

启动：`cd web && docker compose up -d --build`。

生产必须：
1. 设置强 `JWT_SECRET`（compose 兜底值是公开的 `please-change-me`）。
2. 修改默认 `admin/admin123`（前端「设置」页有改密接口；也可按 `../DEPLOY.md` 用容器内 Python 方式）。
3. 配置 HTTPS（当前 nginx 仅 80）。
