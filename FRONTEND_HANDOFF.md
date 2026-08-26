# 前端交接文本

> 给前端开发者 / agent 的现状说明。后端接口以 `API_CONTRACT.md` 为准；本文聚焦前端要对接的行为与已做/待做。

## 0. 技术栈与起点
- Vue3 + TS + Vite（`web/frontend/`）；路由 `vue-router`，状态 `pinia`（`stores/auth.ts`、`stores/ui.ts`）。
- API 统一出口 `src/api/index.ts`，axios 实例 `src/api/http.ts`，`baseURL=/api/v1`、`withCredentials`。
- **Mock 开关**：`VITE_USE_MOCK=false` 走真实后端（dev 代理到 `localhost:8000`）；缺省 true 为内置 Mock。
- 客户端错误统一由 `http.ts` 拦截器转成 `Error(detail)`，并带 `cause=code`（HTTP 状态码）。

## 1. 认证
- `POST /auth/login` → `{access_token, user}`，服务端同时种 HttpOnly Cookie `demo_token`。
- 前端用 Cookie 即可；agent 用 `Authorization: Bearer <token>`。
- 未登录也能上传（public 身份，见 §3）。首页导航：登录后右上角显示用户名 → `/user/{username}`。

## 2. 关键接口（已实现，前端必须对齐）
| 主题 | 说明 |
|---|---|
| 标签分级 | `GET /tags/tag-keys` 返回 `[{key,mode(fixed/open/int),label,description,sort,values[{value,description,demo_count,group}],demo_count,min,max}]`；fixed 只能选候选值、int 值必须整数；int 键带 `min/max` 供滑条。 |
| 标签申请 | `POST /tags/suggestions` 提交新 fixed 值（pending）；admin `GET /tags/admin/suggestions` + `POST /tags/admin/suggestions/{id}/review` 审核。 |
| Demo 类型 | `demo_type`：`web`（zip 含 index.html，可预览）/ `zip`（文件包，下载）/ `link`（外部链接，跳外链）。详情 `GET /demos/{slug}` 返回这些字段 + `prompt`/`video_url`。 |
| 上传 | `POST /demos`（multipart）与 `POST /demos/from-url`（JSON），均可匿名。 |
| 幂等 | `idempotency_key`（8~128 位字母数字 `_ . -`）；重试同 key → `created:false`。 |
| 内容去重 | 同作者相同 zip（sha256）→ **409**，detail 含 `/demo/<slug>`；管理员 `force` 可跳过。 |
| 封面 | 上传受整体上限（默认 200MB）约束，后端自动压缩为 WebP（最大边 1280），`cover_url` 返回 `/media/covers/xxx.webp`。 |
| 公告 | `GET /announcements` 4 类：`manual`/`auto`/`update`/`demo_update`（`update`=站点 git commit 实时合并，60s 缓存）。 |
| 推荐 | `GET /demos/{slug}/related?limit=30`（相关候选池）；`GET /demos?sort=random`（精选随机）。 |
| 访问统计 | `GET /stats/visits` 读 PV；**前端必须打点**：`router.afterEach` 调 `api.reportVisit()`（`POST /stats/visit`），一次路由切换 = 1 PV。 |
| 实时访问 | `GET /stats/live`（在线/近1/5分钟/今日）；**前端必须心跳**：模块级每 30s `api.reportHeartbeat()`（`POST /stats/heartbeat`）。About 页每 10s 拉一次 live。 |
| 评分/榜单 | `GET/POST/DELETE /demos/{slug}/rating`（1~5，5=神/1=鬼，可改可撤）；`GET /leaderboard?sort=avg|god|ghost|net|count|heat`。匿名评分需传 localStorage `device_id`。 |
| 论坛 | `GET/POST /forum/topics`、`GET/POST /forum/topics/{id}/replies`（发帖/回复需登录；回复支持 `parent_id` 嵌套 + 分页；排序 `newest/popular/replies/hot`；`sticky=1`/`participated=1` 过滤；locked 主题 403）；admin `/forum/admin/topics`（可改 locked/solved）。`GET /demos/{slug}/meta` 轻量作品卡（不增浏览数）。 |

## 3. 匿名（public）上传
- 未登录上传：作者恒为 `public`（无 nickname），`author_id=null`；不能评论、不能编辑/删除。
- 公开用户页 `/author/public`：`GET /demos?status=approved&author=public`。
- 后端匿名限流：无 `upload_code` 每 IP 每小时 20 次（429）；`UPLOAD_CODE` 信任通道免审核/限流。

## 4. 上传页 UploadView（`/upload`）——重点
已实现：
- **防抖**：`submit()` 入口 `if (submitting) return`，按钮 `:disabled`，连点/回车不重复。
- **进度条**：`onUploadProgress` 实时百分比；`uploadProgress>=100` 显示「服务器处理中（解压/传 OSS）…」。
- **409 去重提示**：catch 里正则 `/\/demo\/([^/\s]+)/` 提取 `dupSlug`，错误框显示「查看已有 Demo →」跳转。
- 未登录显示公开上传提示（无昵称输入，作者固定 public）。
- 类型选择（web/zip/link）+ 条件表单（link 填 external_url；web/zip 传 zip）+ 提示词 prompt + 视频链接 video_url + 封面上传（自动压缩）。标签用 tagKeys 选择器（fixed chips / open 输入+介绍 / int 数字）。

待做/可选：
- 管理后台「标签键管理」的删除/编辑已有接口支持（`DELETE /tags/admin/tag-keys/{key}` 等），管理 UI 已实现新建/编辑/删除键、删除值、建议审核、AI 建议。
- 前端尚未接 `POST /demos/from-url`、`idempotency_key`、`upload_code`、`force` 字段（上传页无幂等键/upload_code 输入），如需 agent 友好上传可后续补。
- 排行榜 `range=all/week/month` 前端已传，但后端暂不支持（静默无效），待后端修复或前端移除。

## 5. 已拆页面 / 路由
- `/` 首页：欢迎/展示/入口卡片 + 精选 + 公告（无搜索）。
- `/demos` 探索页：作品库（搜索/列表/分页）。
- `/tags` 标签主页、`/tag/:k/:v` 标签详情、`/user/:username` 用户页、`/author/public` 公开用户页。
- `/upload` 上传（无需登录）、`/admin` 管理后台（admin）、`/login`、`/register`、`/settings`。
- `/leaderboard` 排行榜、`/about` 关于/统计/赞助/致谢、`/admin/sponsors` 赞助/致谢管理、`/:pathMatch(.*)*` 404。

## 6. 注意事项
- **OSS 降级**：后端 OSS 失败会降级本地存储并在日志 warn，前端无需感知（`preview_url` 或 `/preview/` 路径仍可用）。
- **封面**：新上传/历史迁移后 cover_url 都是 `.webp`，`<img>` 无需特殊处理。
- **标签**：已下线旧 `GET /tags` 扁平接口，一律用 `tag-keys`；`post /tags` 仅 admin 加 fixed 值。
- **搜索/过滤**：`GET /demos?q=&tag=k:v&author=&sort=&page=`；首屏首页用 `page_size=6~8` 精选即可。
- **DSH 会话轨迹**：上传 zip 若含 `*.jsonl`（如 dsh 的 `session.jsonl`）会自动进「会话日志」；`selectedLog` 以 `.jsonl` 结尾时用 `DshTrajectoryView` 渲染（不要用 MarkdownView）。
- **会话日志**：默认本地存储；启用 OSS 备份时只存 OSS、本地不落盘。前端经 `GET /demos/{slug}/session-logs/{filename}` 取（每 IP 限流 60/小时，429 请稍后再试）。渲染能力保留，但不必当热内容设计；429 需静默降级。
- **存储模式**：zip 下载默认服务器本地下发（OSS 仅备份）；预览子资源与 `/media` 封面也已尊重 `OSS_SERVE_LOCAL`（已修复），前端无感知（`preview_url`/`/preview/`/`/media/` 路径均可用）。
- **访问统计打点**：`router.afterEach` 已调 `api.reportVisit()`（fire-and-forget，失败静默）；**不要移除**，否则 About 页 PV 不涨。打点接口有每 IP 限流，429 静默即可。
- **单文件上传**：`web` 类型可直接传 `.html/.svg`（按后缀识别）；上传页文件框 accept 已含 `.html,.svg`，提示「单 HTML 必须自包含」。详情页 `demo.single_file` 存在时下载按钮显示「下载文件」。

## 7. 上云/本地
- 联调：`frontend/.env` 设 `VITE_USE_MOCK=false`，dev 代理已指 `localhost:8000`。
- typecheck：`npm run typecheck`（务必通过再提交）。

## 8. 最近后端能力交接（标签 group/合并、论坛、公告互链）

### 标签 group 管理（admin）
| 接口 | 用途 |
|---|---|
| `GET /tags/admin/groups?key=model` | 列出该 key 的 group 分布（含 ungrouped 数） |
| `PUT /tags/admin/groups/{key}/{group}` | 重命名 group：`{new_group}` |
| `DELETE /tags/admin/groups/{key}/{group}` | 清除 group |
| `PUT /tags/admin/values/{tag_id}/group` | 给单个值设/清 group：`{group}` |

公开 `GET /tags/tag-keys` 的 fixed value 已带 `group`，前端按 group 分组展示即可。

### 标签合并（admin）
`POST /tags/admin/merge`
```json
{ "from_key": "model", "from_value": "dsv4flash", "to_key": "model", "to_value": "dsv4-flash", "dry_run": true }
```
- 返回 `{merged, removed_dups, affected_demos, deleted_source, dry_run}`
- 管理 UI 建议：合并弹窗先 `dry_run=true` 预览受影响 demo 数，确认后再执行

### models.dev 同步（admin）
`POST /tags/admin/sync-models`：拉 models.dev 模型字典，新模型写 pending 建议、已有模型更新 group。管理后台可加「从 models.dev 同步」按钮 + 显示 pending 建议数。

### 论坛（完整）
公开：`GET /forum/topics?demo=slug`、`GET /forum/topics/{id}`、`GET /forum/topics/{id}/replies`、`GET /forum/reactions/summary`
登录：`POST /forum/topics`、`POST /forum/topics/{id}/replies`、`POST /forum/reports`、`POST /forum/reactions`（赞/感谢切换）
管理：`GET/PUT/POST/DELETE /forum/admin/topics*`、`GET/POST /forum/admin/replies*`、`POST /forum/admin/users/{uid}/ban`、`GET/POST /forum/admin/reports*`
- 新用户发帖/回复返回 `status=reviewing` → 前端提示「已提交，等待审核」
- 429 带 `Retry-After` 头，可提示「X 秒后重试」
- 首帖「用户须知 & 安全说明」启动时自动创建（category=notice、置顶），论坛列表第一条展示
- 富卡片：`GET /demos/{slug}/meta` 返回 `{slug,title,cover_url,author}`（不增浏览数）
- 旧评论 `POST/DELETE` 已 410 下线；`GET /demos/{slug}/comments` 只读保留
- 主题/回复输出含 `like_count` / `thanks_count` / `my_reactions`，可直接展示赞/感谢按钮状态
- `GET /forum/topics?followed=1`：只看我关注的用户的主题（需登录）

### 社区互动 / 用户主页
- `GET /users/{username}/profile`：声望/作品/主题/回复/粉丝/关注统计
- `POST /users/{user_id}/follow`：关注/取关切换
- `GET /users/{username}/followers`、`GET /users/{username}/following`：粉丝/关注列表
- 前端建议：用户卡片/主页显示声望与关注按钮；论坛列表可加「关注」过滤 Tab

### 公告 ↔ 论坛互链
- 公告创建/更新可传 `topic_id`
- 公告响应带 `topic_id` / `topic_title`，前端显示「去讨论 →」跳 `/forum/topics/{id}`
- 公告管理表单需补 `topic_id` 输入/选择（后端已支持）

### 站内通知
- 接口：`GET /notifications`、`GET /notifications/unread-count`、`POST /notifications/read`、`POST /notifications/read-all`
- 类型：`forum_reply`（回复/@提及）、`forum_reaction`（赞/感谢）、`demo_review`（待审）、`review_result`（审核结果）、`report_handled`（举报处理）
- 前端：顶栏铃铛 + 未读红点（轮询 unread-count），`/notifications` 页分组展示
