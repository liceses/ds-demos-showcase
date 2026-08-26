# 后端设计（已实现：FastAPI，按前端契约对齐）

> 前端已由另一 agent 完成（Vue3 + TS，`web/frontend`），其 API 契约以 `src/api/types.ts` / `index.ts` 为准。
> 本后端实现与前端 `http.ts` 的 `baseURL=/api/v1` 完全对齐，已通过本地联调验证。

---

## 1. 概览

```
web/
├── frontend/        # Vue3 + Vite（已由另一 agent 完成）
└── backend/         # 本目录：FastAPI 后端（新增）
    ├── app/
    │   ├── main.py          # 入口、/preview 与 /media 静态路由、初始化
    │   ├── config.py        # 配置（.env）
    │   ├── database.py      # SQLAlchemy
    │   ├── models.py        # ORM
    │   ├── schemas.py       # Pydantic 响应模型
    │   ├── security.py      # 密码 / JWT / Cookie
    │   ├── deps.py          # 当前用户 / 管理员依赖
    │   ├── serializers.py   # Demo/Tag 序列化
    │   ├── routers/         # auth, users, tags, demos, comments, sessions, admin, announcements, meta, stats, ratings
    │   └── services/        # storage(解压/封面/大小), oss, oss_sync, settings_service, site_git, visits, git_service
    ├── requirements.txt
    ├── .env.example
    └── storage/             # demo 文件、封面（运行时生成）
scripts/recompress_covers.py   # 历史封面压缩迁移（一次性维护脚本）
```

- 数据库：SQLite（`data/app.db`），单机 MVP 足够；后期换 PostgreSQL 也容易。
- 文件存储：本地磁盘（`storage/demos`、`storage/media`），后期可接 OSS。
- 登录：账号密码 + JWT（`access_token` 同时放 body 和 HttpOnly Cookie `demo_token`）。
- 已撤回微信登录，只做本地账号 + GitHub（可后加）。

---

## 2. 启动

```bash
cd web/backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

首次启动自动建表并写入：
- 管理员：`admin / admin123`
- 初始标签：`model:*`（当前 97 个常见值，2026-08 更新，按厂商分组）、`plugin:routing-suite`、`skills:J-space`、`preset:router-standard`、`type:*`、`category:*`（3D建模/仿真/动画/图形学）等；完整 seed 见 `main.py` 的 `_DEFAULT_TAG_KEYS` / `_DEFAULT_TAGS`

前端联调：`web/frontend/.env` 设 `VITE_USE_MOCK=false`，dev 代理已指向 `localhost:8000`。

---

## 3. API 汇总（前缀 `/api/v1`）

统一错误：`{ "detail": string, "code": string }`。
状态语义：400 校验/zip 非法、401 未认证、403 越权、404、409 冲突、413 超限、422 参数、429 限流、500 内部/io、503 依赖、507 磁盘。

### 认证
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | `{username,password}` → 201 `{access_token,user}` + Cookie（用户名 3-32，密码≥8） |
| POST | `/auth/login` | 同上；密码错 401；status≠active → 403 |
| POST | `/auth/logout` | 清 Cookie → 204 |
| GET | `/auth/me` | 当前用户 |
| GET | `/users/{username}` | 用户公开信息 + `demo_count` |
| PATCH | `/users/{id}` | admin：`{role?,status?}` |

### 标签（分级，扁平列表已下线）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/tags/tag-keys` | 标签键定义（mode/values/group/min/max/demo_count） |
| GET | `/tags/{key}:{value}` | 详情 + `parent` + `children` |
| POST | `/tags` | 创建 fixed value（key=`author`/`version-of` 应保留 → 400/409；当前 `version-of` 校验待修） |

### Demo
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/demos` | `?status=&tag=k:v&q=&author=&sort=newest\|popular\|random\|prompt&page=&page_size=` |
| GET | `/demos/{slug}` | 详情（含 session_log_count/timeline/is_author/大小） |
| POST | `/demos` | multipart：`title, description?, tags(JSON), cover?, file(zip必填)` → 201 `{slug,status}` |
| PUT | `/demos/{slug}` | 作者/admin，同字段 → 204 |
| DELETE | `/demos/{slug}` | 作者/admin → 204 |
| GET | `/demos/{slug}/download` | zip blob |
| GET | `/preview/{slug}/...` | 解压后的 demo 静态文件（iframe） |

上传自动：解压 zip（要求根 index.html）→ 自动附 `author:{username}` 标签 → 写入 v1 时间线 + 新 Demo 公告 → 依 `auto_approve` 置状态。

### 评论（树形，回复深度≤5）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/demos/{slug}/comments` | `[{...,children?}]` |
| POST | `/demos/{slug}/comments` | `{content,parent_id?}` → 201 |
| DELETE | `/comments/{id}` | 本人/admin → 204 |

### Session Logs
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/demos/{slug}/session-logs` | `[{id,filename,file_size,created_at}]`（扫描 `storage/demos/{slug}/sessions`，上传 zip 内 `sessions/` 目录自动归位） |
| GET | `/demos/{slug}/session-logs/{filename}` | 文本/markdown |

### 版本时间线（原 git 生成过程已简化）

- 无独立 `/commits` 接口；`GET /demos/{slug}` 返回 `timeline: [{id,version_label,message,old_slug,created_at}]`。
- 创建、更新、旧版快照会自动写入时间线；`old_slug` 非空表示可跳转到旧版页面。

### 管理后台（admin）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/review` | 待审 Demo |
| POST | `/admin/review/{slug}` | `{action:"approve"\|"reject"}` |
| GET | `/admin/demos` | 全部 + storage_size/inconsistency |
| GET | `/admin/users` | 用户列表 |
| GET/PUT | `/admin/settings` | `{auto_approve, auto_approve_public}` |

---

## 4. 关键实现点

- **鉴权**：JWT（HS256，`JWT_SECRET` 需改）；token 同时放 body 与 HttpOnly Cookie，兼容 Bearer 头。密码用 PBKDF2（std 库，无额外依赖）。
- **上传限制**：zip `MAX_UPLOAD_SIZE` 默认 200MB；封面同样受整体上传上限（默认 200MB）约束，自动压缩（见下节）。
- **单文件模式**：`web` 类型可直接上传单个 `.html/.svg`（按后缀识别，`single_file` 列标记）；单 HTML 存 `index.html`、单 SVG 存 `index.svg`，预览/下载直接服务原文件；单 HTML 要求自包含。
- **预览安全**：`/preview/{slug}/{path}` 解析到 `storage/demos/{slug}/files`，做路径穿越防护。
- **版本时间线**：不再为每个 demo 维护 git 仓库；用 `DemoTimeline` 轻量记录创建/更新/旧版快照，避免依赖 git 子进程。
- **DSH 会话轨迹**：dsh 导出的 zip 常含 `session.jsonl`；`extract_zip` 会把 `*.jsonl` / `session*.json` / `trace*.json/l` 自动提取进 `demo_sessions/`，进「会话日志」Tab；前端对 `.jsonl` 走 DSH 渲染器。
- **会话日志存储与防护**：默认**本地存储**；启用 OSS 备份时 log **只进 OSS**（`demos/{slug}/sessions/`）、本地不落盘（OSS 未启用时本地兜底）；列表走 OSS 前缀，**内容经后端代理 + 每 IP 限流（60 次/小时）**，不暴露 OSS 公网直链，避免 bot 爬取刷 OSS 下行流量。
- **存储模式**：`OSS_SERVE_LOCAL=true`（默认）→ zip 下载走本地服务器，OSS 仅**双写备份**（上行免费）；`false` → 直连 OSS 省服务器带宽。⚠️ **已知问题**：`main.py` 的预览子资源与 `/media` 封面目前只要 `oss.enabled()` 就 302 直连 OSS，未完全遵守 `OSS_SERVE_LOCAL`，仍会产生 OSS 下行流量（待后端修复）。
- **标签**：扁平存储 + `parent_id` 层级，对外用 `GET /tags/tag-keys` 返回键定义与候选值（旧 `GET /tags` 扁平列表已下线）。

### 上传去重（幂等键 + 内容哈希）

- **幂等键**：`idempotency_key`（8~128 位，唯一索引）；agent 超时/失败重试带同一 key → 返回已有结果 `created:false`，不重复创建。
- **内容哈希**：`content_hash` = zip 原始字节 sha256（普通索引）。**按作者去重**：同作者上传相同 zip → 409 + existing demo 链接；匿名（public）共享同一去重池；同 demo 自我更新上传相同文件不算重复；link 无 zip 不校验；`force`（仅 admin）可强制上传。
- 历史数据**不回填**哈希，只对新上传生效；`content_hash` 列由启动迁移自动补。

### 封面自动压缩

- **策略**：上传原图受整体上传上限（默认 200MB）约束 → 后端 Pillow 压缩为 **WebP（最大边 1280px、质量 82、method 4）** → **只保存压缩版**；SVG 为文本直接原样直存。
- **全通道覆盖**：网页 multipart `cover`、AI agent `from-url` 的 `cover_url`、编辑更新封面，统一走 `storage.save_cover()`。
- **流量收益**：封面文件名唯一 + `Cache-Control: immutable` 长期缓存；压缩后通常从 MB 级降到几十 KB，首页/列表高频拉取成本大幅下降。
- **依赖**：`Pillow>=10.0`（已加入 requirements.txt）。
- **历史数据迁移**（已有大封面才需要）：
  ```bash
  # 本地（web/ 目录下）
  python scripts/recompress_covers.py
  # 服务器容器内（仓库根已只读挂载到 /site-repo）
  docker compose exec backend python /site-repo/scripts/recompress_covers.py
  ```
  批量压缩为 WebP → 更新 `demos.cover_url` → 删除旧本地文件与 OSS 对象；幂等（`.webp` 自动跳过），可重复运行。

### 推荐（轻量）

- **相关推荐** `GET /demos/{slug}/related?limit=30`：score = 标签重合（type/game=3、model/category=2、其余 1）+ 同类型 +0.5 + 热度(view+2*download)*0.001 + 随机抖动；排除自身；返回排序候选池。
- **首页精选** `GET /demos?sort=random`：内存缓存洗牌 id 序（60s TTL），避免每次 `ORDER BY RANDOM()` 全表随机。
- 前端拿到相关候选池后**本地洗牌「换一批」**（不重复、不额外请求）；标签过少的 demo 用「同类型 + 热度 + 随机」保底，保证池子不空。

### 访问统计（前端打点 PV）

- **打点**：前端 `router.afterEach` 调 `POST /api/v1/stats/visit`（一次路由切换 = 1 PV），带每 IP 每分钟 30 次限流（429）。
- **计数**：`visits.record_visit()` 内存 +1，后台线程每 30s 落库 `visit_daily`，**累加式**（`count += 增量`，绝不覆盖历史值）；`ips` 字段保留当日去重 IP（UV 备用）。
- **读取**：`GET /api/v1/stats/visits` 返回 `today/yesterday/total/last7`（升序，当天在最后）；today = 库值 + 内存未落库实时量。
- **实时**：`POST /stats/heartbeat`（30s 心跳，每 IP 10 次/分钟限流）维护内存 `_online`；`GET /stats/live` 返回 `online/last1min/last5min/today`（近期 PV 时间戳在内存 deque，10 分钟窗口）。单 worker 内存即可，多 worker 需 Redis。
- **保留**：近 90 天，跨天滚动。
- **防 500**：`record_visit` 与打点接口均 try/except 静默，统计异常绝不影响业务请求。

### 用户评分 + 排行榜

- **模型**：`demo_ratings`（demo_id FK CASCADE、user_id FK SET NULL、rater_key、score 1~5、UNIQUE(demo_id,rater_key)）；`demos` 冗余 `rating_sum/count/avg/god/ghost`。
- **身份**：登录 `user:{id}`；匿名 `anon:sha256(device_id|ip|rating_salt)`（salt 缺省派生自 jwt_secret），每 IP 每 demo 10 次/小时 + 全局 60 次/小时限流。
- **事务**：评分 upsert/撤分与冗余列重算同事务（`_recalc_demo_rating`），保证榜单不漂移。
- **榜单**：`GET /leaderboard?sort=avg|god|ghost|net|count|heat`，只统计 approved；质量榜排除 0 评。
- **外键**：`database.py` 已开启 `PRAGMA foreign_keys=ON`，删 demo 级联删评分。

### 标签系统升级（可生长 / AI 整理 / 范围检索 / 分布）

- **模型**：`Tag.group`（固定值分组/厂商）；`TagValueSuggestion`（用户申请 fixed 值，pending/approved/rejected，可带 demo_id 审核后补挂）。
- **审核流**：用户 `POST /tags/suggestions` 只写 pending；admin `POST /tags/admin/suggestions/{id}/review` approve 才创建 Tag。
- **AI 辅助**：`POST /tags/admin/fetch-models` 写内置主流模型（2026-08 列表）为 pending 建议；`POST /tags/admin/ai-suggest` 返回规则启发式建议（占位，不落库）。⚠️ 当前 `fetch-models` 内置列表仍是旧版，与线上 97 个值不一致，待后端同步。
- **范围检索**：`GET /demos?tag=rounds:3-10` 对 int 键用 `CAST(Tag.value AS INTEGER)` 范围比较；fixed/open 精确。
- **分布**：`GET /tags/tag-keys` 的 int 键返回 `min/max`，前端可做滑条/直方图；fixed value 返回 `group` 分组。
- **group 管理**：`/tags/admin/groups` 列/重命名/清除 group；`/tags/admin/values/{id}/group` 设置单个值分组（纯字段批量更新）。
- **标签合并**：`POST /tags/admin/merge`（事务内把源引用迁移到目标，删重复引用，删源值；`dry_run` 预览；同 key、无子标签、非保留 key）。

### 论坛 + 作品 meta

- **模型**：`forum_topics`（status normal/hidden/reviewing、pinned/sticky、reply_count/view_count、demo_slug、tags 逗号分隔）+ `forum_replies`（status、topic 级联删）+ `forum_reports`；`users` 扩 `trust_level/need_review/github_bound`。
- **权限**：发帖/回复必须登录（用户+IP 双维限流 10/30 每小时）；匿名只读；Markdown 存原文，前端消毒渲染。
- **审核**：新用户（need_review 或 trust_level<1）发帖/回复进 reviewing；admin 审核 approve 置 normal 并提 trust_level。
- **链接安全**：内容链接仅 http/https，拒绝内网/回环/保留地址 + 域名黑名单（`_validate_links`）。
- **接口**：公开列表/详情/回复；登录发帖/回复/举报；admin 全量/审核/隐藏/删除/封禁/举报处理 + 回复管理列表。
- **首帖**：`init_db` 幂等创建置顶「论坛发帖须知 & 安全说明」（读 `docs/论坛首帖-用户须知与安全说明.md`）。
- **公告互链**：`Announcement.topic_id`（FK forum_topics SET NULL），响应带 `topic_title`；创建/更新校验 topic 为 normal。
- **限流提示**：429 带 `Retry-After` 头 + 冷却秒数。
- **作品 meta**：`GET /demos/{slug}/meta` 轻量返回 `{slug,title,cover_url,author}`，**不增加 view_count**（富卡片专用）。
- **迁移**：`scripts/migrate_comments_to_forum.py` 把历史 comments 按 demo 归集为论坛主题/回复（创建或复用主题，保留 author/content/created_at，`source_comment_id` 幂等去重，重跑不重复）。
- **旧评论**：`GET /demos/{slug}/comments` 只读保留；`POST`/`DELETE` 返回 410（迁移到论坛）。

---

## 5. 部署（后续）

- 单机 MVP：直接跑 uvicorn，或写 `Dockerfile` + `docker compose` 部署到 99 元阿里云服务器。
- 规模化：`DATABASE_URL` 换 PostgreSQL，文件换 OSS（S3 兼容），静态预览改 CDN。
- 若将来想回 Cloudflare：API 契约保持 REST，可把 FastAPI 逻辑平移为 Workers + D1 + R2，前端基本不用改。

---

## 6. 已验证

- 后端全部接口本地起服并通过 curl/node 联调：
  - 注册/登录/me、标签创建/查询、Demo 上传(解压+作者标签+时间线)/详情/更新/下载、评论树、session-logs、admin 审核/设置/用户。
- 前端 `npm run typecheck` ✔、`npm run build` ✔（构建警告为 Vite 动态导入提示，非错误）。