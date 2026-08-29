# AI 全民制作人

「AI 网页 Demo 作品集」展示站：多栏瀑布流主页 + Demo 详情/预览 + 标签系统 + 评论 + 会话日志 + 版本时间线 + **提示词模式** + 上传下载 + 管理后台。

技术栈：**Vue 3 + TypeScript + Vite（前端） / FastAPI + SQLAlchemy（后端） / SQLite + 本地存储 / Nginx（生产托管与反代） / Docker Compose（部署）**。

> **架构说明**：早前曾用 Cloudflare Worker 全栈方案（git 历史可见），**现已弃用**；线上以「云服务器 + FastAPI + nginx + Docker Compose」为准。

## ✨ 亮点

- **提示词模式**：作品库一键切换到「提示词」视图，直接看每个作品的第一轮提示词——AI 是怎么被“一句话点单”的，一目了然。
- 每个作品附带**生成会话日志**与**版本时间线**，过程全透明。

## 目录

```
web/
├── frontend/           # Vue3 + Vite SPA（含 Dockerfile、nginx.conf）
├── backend/            # FastAPI 后端（含 Dockerfile；API/预览/媒体/审核）
├── docker-compose.yml  # 生产部署：backend + frontend(nginx)
├── backend-design.md   # 后端设计 / API 契约
├── DEPLOY.md           # 生产部署指南
├── idea.md             # 原始需求
├── start-dev.ps1/.bat  # 本地一键启动（开发环境）
├── docs/
│   ├── 预览架构与排坑记录.md  # 预览 iframe 架构决策 + 三个大坑（localStorage/OSS 强制下载/CORS）与配置清单
│   └── 运维经验与排坑记录.md  # 线上运维沉淀：Docker/OSS/CDN 缓存/性能/迁移/安全/AI agent 集成
└── stylepkg/           # 视觉设计规范（neo-brutalist-playful）
```

## 生产拓扑

```
浏览器 → Nginx(:80)
          ├── /api、/preview、/media → FastAPI(:8000)
          ├── /assets → 静态资源（长缓存）
          └── 其余 → SPA 回退 index.html
数据：SQLite（volume demo-data）+ storage/（volume demo-storage：demo 文件 / 封面 / 会话日志）
```

## 本地开发

Windows 双击 `start-dev.bat`，或在 `web/` 下执行：

```powershell
./start-dev.ps1
```

脚本自动：准备后端虚拟环境并装依赖 → 写入 `frontend/.env` 的 `VITE_USE_MOCK=false` → 前端补 `npm install` → 启动后端 `:8000` 与前端 `:5173`。

启动后：
- 前端页面：http://localhost:5173（`.env` 设 `VITE_USE_MOCK=false` 连真实后端；缺省用内置 Mock 占位数据）
- API 文档：http://127.0.0.1:8000/docs
- 默认账号：`admin / admin123`（**仅限开发**；生产必须改，见「安全须知」）

## 需求 ↔ 实现对齐（idea.md）

| # | 需求 | 状态 | 说明 |
|---|---|---|---|
| 1 | 多栏内容瀑布流主页 | ✅ | CSS 多栏瀑布流（`columns: 3 280px`）+ 无限滚动 + 搜索 + 标签筛选 + 排序 |
| 2 | 独立展示页（demo/标签/信息/评论） | ✅ | DemoView 四 Tab：信息 / 时间线 / 会话日志 / 评论 |
| 3 | 标签系统（键值对/自定义/介绍/层级） | ✅ | `key/value/description/parent_id`；管理端建标签、上传自动建（⚠️ 缺字符集校验与每日限额） |
| 4 | 按标签查找 demos | ✅ | `/demos?tag=k:v`（多标签 AND）+ 标签详情页（父链/子标签） |
| 5 | 每个 demo 伴随 session log | ✅ | 上传 zip 内 `sessions/` 自动归位；列表 + markdown 渲染 |
| 6 | 版本时间线（原 git 生成过程已简化） | ✅ | 轻量时间线记录创建/更新/旧版快照，展示于「时间线」Tab；不再维护每 demo git 仓库（非 AI 真实性证明） |
| 7 | 部署 Cloudflare / 可迁移 | ⚠️ | 实际迁移到云服务器 FastAPI + nginx（docker compose）；CF Worker 方案已弃用 |
| 8 | 用户/登录/评论 + 作者附加 tag | ✅ | JWT(HttpOnly Cookie) 本地账号 + 评论树（深度≤5）+ 自动 `author:` 标签（gh 登录为 todo，未做） |
| 9 | 优良扩展性的底层架构 | ⚠️ | 模块化清晰（APIRouter/services），但无 Alembic/状态机/配额，SQLite 单写，属"单机级"扩展 |
| 10 | 生成占位 demos | ✅ | 前端 Mock 6 个占位 demo（`VITE_USE_MOCK`）；后端无 seed 脚本 |
| 11 | 初始 tags | ✅ | `model:*`（97 个常见值，2026-08 更新，按厂商分组）、`plugin:routing-suite`、`skills:J-space`、`preset:router-standard`、`type:*`、`category:*` 等 |
| 12 | 上传下载 + 自动限流 | ⚠️ | 上传/下载 ✅（下载计数）；限流已实现：匿名上传 20 次/小时、标签建议 10 次/小时、评分 10+60 次/小时、访问打点 30 次/分、会话日志 60 次/小时；zip 解压防护（压缩比/条目数/符号链接）❌ |
| 13 | UI 完全参考参考站 | ⚠️ | 采用 neo-brutalist-playful 规范（stylepkg/），是否"完全参考"需人工比对 |
| todo | gh 登录 | ❌ | 未实现 |
| todo | demos 的 gh 仓库一步迁移 | ❌ | 未实现 |

> 生产规范（项目计划书）中尚未落地的工程条目：zip 解压防护（压缩比/条目数/符号链接）、安全响应头、审计日志、备份脚本、health/ready、CI/测试、非 root 容器——详见 `DEPLOY.md`「上线前安全清单」。

## 安全须知

- **admin 默认密码**：生产默认仍为 `admin/admin123`，请部署后第一时间在「设置」页改密（也可按 `DEPLOY.md` 用容器内 Python 方式）。
- **JWT_SECRET**：docker-compose 兜底值是公开的 `please-change-me`，生产必须在 `web/.env` 设置强随机值（`openssl rand -hex 32`），否则可伪造任意用户 Token。
- **HTTPS**：线上由 **Cloudflare 提供全站 HTTPS**（边缘终止，`nginx.conf` 仅监听 80、回源 http）。浏览器 → Cloudflare 已加密；因后端按 `request.url.scheme` 判定 Cookie `secure`，回源 http 导致 JWT Cookie 暂无 `Secure` 标志（待代码修复）。若脱离 Cloudflare 部署，需自行配 TLS（certbot，见 `DEPLOY.md` 安全清单）。

## 部署

见 `DEPLOY.md`。
