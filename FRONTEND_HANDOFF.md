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
| 标签分级 | `GET /tags/tag-keys` 返回 `[{key,mode(fixed/open/int),label,description,sort,values[{value,description,demo_count}],demo_count}]`；fixed 只能选候选值、int 值必须整数。 |
| Demo 类型 | `demo_type`：`web`（zip 含 index.html，可预览）/ `zip`（文件包，下载）/ `link`（外部链接，跳外链）。详情 `GET /demos/{slug}` 返回这些字段 + `prompt`/`video_url`。 |
| 上传 | `POST /demos`（multipart）与 `POST /demos/from-url`（JSON），均可匿名。 |
| 幂等 | `idempotency_key`（8~128 位字母数字 `_ . -`）；重试同 key → `created:false`。 |
| 内容去重 | 同作者相同 zip（sha256）→ **409**，detail 含 `/demo/<slug>`；管理员 `force` 可跳过。 |
| 封面 | 上传不限大小，后端自动压缩为 WebP（最大边 1280），`cover_url` 返回 `/media/covers/xxx.webp`。 |
| 公告 | `GET /announcements` 4 类：`manual`/`auto`/`update`/`demo_update`（`update`=站点 git commit 实时合并，60s 缓存）。 |
| 推荐 | `GET /demos/{slug}/related?limit=30`（相关候选池）；`GET /demos?sort=random`（精选随机）。 |

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
- 管理后台「标签键管理」的删除/编辑已有接口支持（`DELETE /tags/admin/tag-keys/{key}` 等），但管理 UI 目前只有新建键 + 加固定值；删除键/值可补按钮。

## 5. 已拆页面 / 路由
- `/` 首页：欢迎/展示/入口卡片 + 精选 + 公告（无搜索）。
- `/demos` 探索页：作品库（搜索/列表/分页）。
- `/tags` 标签主页、`/tag/:k/:v` 标签详情、`/user/:username` 用户页、`/author/public` 公开用户页。
- `/upload` 上传（无需登录）、`/admin` 管理后台（admin）、`/login`、`/register`、`/settings`。

## 6. 注意事项
- **OSS 降级**：后端 OSS 失败会降级本地存储并在日志 warn，前端无需感知（`preview_url` 或 `/preview/` 路径仍可用）。
- **封面**：新上传/历史迁移后 cover_url 都是 `.webp`，`<img>` 无需特殊处理。
- **标签**：已下线旧 `GET /tags` 扁平接口，一律用 `tag-keys`；`post /tags` 仅 admin 加 fixed 值。
- **搜索/过滤**：`GET /demos?q=&tag=k:v&author=&sort=&page=`；首屏首页用 `page_size=6~8` 精选即可。
- **DSH 会话轨迹**：上传 zip 若含 `*.jsonl`（如 dsh 的 `session.jsonl`）会自动进「会话日志」；`selectedLog` 以 `.jsonl` 结尾时用 `DshTrajectoryView` 渲染（不要用 MarkdownView）。
- **会话日志**：只存 OSS、本地不落盘；前端通过 `GET /session-logs/{filename}` 经后端代理取（每 IP 限流 60 次/小时，429 提示请稍后再试）。渲染能力保留，但不必把它当热内容设计；`429` 需静默降级为空「访问太频繁」。

## 7. 上云/本地
- 联调：`frontend/.env` 设 `VITE_USE_MOCK=false`，dev 代理已指 `localhost:8000`。
- typecheck：`npm run typecheck`（务必通过再提交）。
