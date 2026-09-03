# 前端对接信息（公告系统 + Demo 修改）

> 本文件给前端开发对接用：后端已实现公告系统与 Demo 修改能力，接口如下。
> 基础前缀：`/api/v1`，认证方式：HttpOnly Cookie `demo_token`（`withCredentials: true`），与现有接口一致。
>
> **变更记录**：
> - 每 demo 的 git 生成过程功能已移除（`commits` 相关接口不再提供）
> - 改为**轻量时间线**：创建/更新自动记录，有旧版时可在时间线点击跳转（见「2. Demo 修改」）
> - Demo 更新默认只保留最新文件，可选「保留旧版本为独立页面」

## 1. 整站公告系统

### 公告类型（`type` 字段）

| type | 含义 | 产生方式 |
|---|---|---|
| `manual` | 手动公告（整站） | 管理员在后台发布 |
| `auto` | 自动公告：新 Demo 发布 | 上传 demo 后自动生成，content = demo 标题 |
| `demo_update` | 作品更新公告 | 编辑 demo 后自动生成，content = 该 demo 的 commit 信息 |
| `update` | **站点更新公告** | **实时读取网站自身 git 仓库（GitHub 仓库）的 commit 信息**生成，content = commit message |

> 说明：
> - `update`（站点更新）不落库，每次 `GET /announcements` 时实时读取服务器上网站仓库的 `git log`（最近 30 条）合并返回
> - 作品公告（`auto` / `demo_update`）会带上 `demo_slug`，前端可渲染成跳转链接；站点更新 `demo_slug` 为 null
> - 旧数据兼容：历史 `type=update` 且带 `demo_slug` 的记录按 `demo_update` 返回

### 接口

#### GET `/api/v1/announcements`（公开，无需登录）

返回整站公告列表（手动 + 自动 + 作品更新 + 站点更新，最多 50 条，按时间倒序）：

```json
[
  { "id": 4, "type": "update", "title": "站点更新", "content": "feat: 整站公告系统上线", "demo_slug": null, "created_by": null, "created_at": "2025-06-02T08:00:00" },
  { "id": 1, "type": "manual", "title": "站点公告", "content": "欢迎投稿", "demo_slug": null, "created_by": 1, "created_at": "2025-06-01T10:00:00" },
  { "id": 3, "type": "demo_update", "title": "Demo 更新：xx", "content": "修复第二关音效", "demo_slug": "pvz-xxx", "created_by": 2, "created_at": "2025-05-30T15:30:00" }
]
```

#### GET `/api/v1/announcements/{id}`（公开）

返回单条公告详情（仅可见公告，否则 404）；站点更新（负 id）无详情返回 404。

#### GET `/api/v1/admin/announcements/{id}`（仅 admin）

返回任意状态公告详情（含草稿/下线）。

#### GET `/api/v1/admin/announcements`（仅 admin）

支持 `?status=draft|published|offline&category=xxx&pinned=true` 过滤，返回全部状态（含草稿/下线）。

#### POST `/api/v1/admin/announcements`（仅 admin）

请求体：
```json
{
  "title": "公告标题",
  "content": "公告内容（支持 Markdown，可选）",
  "demo_slug": null,
  "pinned": false,
  "status": "published",
  "category": "general",
  "published_at": null,
  "expires_at": null,
  "topic_id": null
}
```
返回 201 + 创建的公告对象（`type` 固定为 `manual`）；`topic_id` 关联正常论坛主题，响应带 `topic_title` 供前端显示「去讨论」。

#### PUT `/api/v1/admin/announcements/{id}`（仅 admin）

请求体同上，返回更新后的公告对象；`demo_slug` 传 null 可清空。

#### DELETE `/api/v1/admin/announcements/{id}`（仅 admin）

返回 204。

> **公开可见规则**：`GET /announcements` 只返回 `status=published`、未过期（`expires_at` 为空或未到）、且已到 `published_at`（为空或已到）的公告；置顶公告排前。自动公告（auto/demo_update）生成时直接 `published`，`category=demo`；站点更新 `category=system`。

### 前端建议

- 首页顶部展示最近若干条公告，按 `type` 显示徽标：手动公告 / 新发布 / 作品更新 / 站点更新
- 有 `demo_slug` 的公告渲染为可点击链接 → `/demo/{slug}`
- 管理后台「公告管理」页：发布/删除手动公告；自动/作品/站点更新公告只读展示（可删除）

## 2. Demo 修改

### 权限

- **作者**：可以修改/删除自己的 demo
- **admin**：可以修改/删除所有 demo
- 其他人：403

### 接口

#### PUT `/api/v1/demos/{slug}`（作者或 admin）

`multipart/form-data` 表单字段（全部可选，不传表示不修改）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | string | 新标题 |
| `description` | string | 新描述 |
| `tags` | string | JSON 字符串数组，如 `["model:DeepSeek-V4","type:game"]` |
| `cover` | file | 新封面（可选） |
| `file` | file | 新 zip 包（可选，不传保留原文件） |
| `commit_message` | string | 更新说明（可选），用于生成「作品更新公告」 |
| `keep_old_version` | bool | 上传新 zip 时是否**保留当前版本为独立旧版页面**（默认 false） |

返回 204。

> 说明：
> - **git 功能已移除**：不再为每个 demo 维护 git 仓库，默认只保留最新文件与全部记录（会话日志/评论/元数据）
> - `keep_old_version=true` 且同时上传了新 zip 时，后端会把**当前文件快照**成一个新的独立 demo 页面（新 slug，带 `version-of:{原slug}` 标签），然后才覆盖当前 demo
> - 只要有任何字段变化，自动生成一条 `type=demo_update` 公告，`content` = commit_message（缺省 "更新 demo"）

#### 轻量时间线（不依赖 git）

- `GET /api/v1/demos/{slug}` 详情响应新增 **`timeline`** 数组（按时间倒序）：

```json
"timeline": [
  { "id": 3, "version_label": "v2", "message": "修复音效问题", "old_slug": "pvz-xxxx-v1", "created_at": "2025-06-03T10:00:00" },
  { "id": 1, "version_label": "v1", "message": "创建", "old_slug": null, "created_at": "2025-06-01T08:00:00" }
]
```

- 字段含义：
  - `version_label`：版本号（v1/v2…，旧版页面为「旧版」）
  - `message`：创建/更新说明
  - `old_slug`：**非空时表示该时间点保留了旧版本，前端渲染为可点击跳转链接** → `/demo/{old_slug}`
- 时间线记录规则：
  - 创建 demo → 自动加 `v1 创建`
  - 更新 demo → 自动加 `v{next} {更新说明}`；若勾选了保留旧版本，该条 `old_slug` 指向旧版页面
  - 旧版页面自身也有时间线（`旧版 旧版本快照`，`old_slug` 指回最新版）

#### DELETE `/api/v1/demos/{slug}`（作者或 admin）

返回 204，同时清理本地文件与 OSS 对象。

### 前端建议

- Demo 详情页 Tab：信息 / **时间线** / 会话日志 / 评论
- 时间线 Tab 渲染 `timeline` 数组；`old_slug` 非空的条目显示「查看旧版 →」按钮
- 作者本人或 admin 显示「编辑 / 删除」按钮
- 编辑复用上传页表单：预填标题/描述/标签，zip 可选，新增「更新说明」与「保留旧版本」选项 → 提交到 PUT
- 删除前 `confirm` 二次确认
- 旧版本 demo 页面通过 `version-of:{slug}` 标签互相检索

## 3. 修改密码（顺带交付）

#### POST `/api/v1/auth/change-password`（已登录）

```json
{ "old_password": "旧密码", "new_password": "新密码（≥8位）" }
```
返回 204；旧密码错误返回 401。前端可在个人主页放「修改密码」表单（个人页已实现简单版）。

## 4. 标签系统（分级标签）

> **接口统一**：旧的扁平列表 `GET /api/v1/tags` **已下线**，前端一律使用 `GET /api/v1/tags/tag-keys` 作为数据源；`GET /api/v1/tags/{key}:{value}`（详情/层级）保留。

### 标签键定义（mode）

| mode | 含义 | value 规则 | 示例 |
|---|---|---|---|
| `fixed` | 固定值 | 只能选已存在的 value（管理员维护） | `model:DeepSeek-V4`、`plugin:routing-suite`、`type:game` |
| `open` | 开放值 | key 固定，value 用户自定义 | `game:mc`、`game:pvz` |
| `int` | 数字值 | value 必须为整数（自动规范化存储） | `rounds:3` |

> 发布/编辑 demo 时，后端按标签键定义**强制校验**：
> - 未知 key → 422（需管理员先在标签键管理中定义）
> - `fixed` 的 value 不在候选中 → 422
> - `int` 的 value 不是整数 → 422
> - `author`、`version-of` 为系统保留 key，用户不可使用

### 接口

#### GET `/api/v1/tags/tag-keys`（公开）

返回标签键定义（供选择器 + 标签主页）：

```json
[
  {
    "key": "model",
    "mode": "fixed",
    "label": "模型",
    "description": "AI 模型版本（固定值）",
    "sort": 1,
    "demo_count": 97,
    "values": [
      { "value": "DeepSeek-V4", "description": "DeepSeek V4 通用模型", "demo_count": 0, "group": "DeepSeek" },
      { "value": "GPT-5.5", "description": "OpenAI GPT-5.5", "demo_count": 0, "group": "OpenAI" },
      { "value": "Claude Sonnet 5", "description": "Anthropic Claude Sonnet 5", "demo_count": 0, "group": "Anthropic" },
      { "value": "Gemini 3.1 Pro", "description": "Google Gemini 3.1 Pro", "demo_count": 0, "group": "Google" },
      { "value": "Qwen3.8-Max", "description": "阿里 Qwen3.8-Max", "demo_count": 0, "group": "Qwen" },
      { "value": "GLM-5.2", "description": "智谱 GLM-5.2", "demo_count": 0, "group": "Zhipu" },
      { "value": "Kimi-K3", "description": "月之暗面 Kimi K3", "demo_count": 0, "group": "Kimi" },
      { "value": "Doubao-Seed-2.1-pro", "description": "字节豆包 Seed 2.1 Pro", "demo_count": 0, "group": "ByteDance" }
    ]
  },
  { "key": "game", "mode": "open", "label": "游戏", "description": "游戏名称（自定义值）", "sort": 6, "demo_count": 2, "values": [{ "value": "pvz", "description": "", "demo_count": 2 }] },
  { "key": "rounds", "mode": "int", "label": "轮数", "description": "生成轮数（必须为整数）", "sort": 7, "demo_count": 1, "values": [{ "value": "3", "description": "", "demo_count": 1 }] }
]
```

> 当前 `model` 标签共 **97 个固定值**（2026-08 更新），按厂商分组：DeepSeek / OpenAI / Anthropic / Google / Qwen / 智谱 / Kimi / 字节 / 腾讯 / Meta / Mistral / xAI / MiniMax / 微软 等。完整列表以 `GET /api/v1/tags/tag-keys` 返回为准。

#### POST `/api/v1/tags/admin/tag-keys`（仅 admin）

请求体：
```json
{ "key": "rounds", "mode": "int", "label": "轮数", "description": "生成轮数", "sort": 7 }
```
返回 201 + 标签键对象。

#### PUT `/api/v1/tags/admin/tag-keys/{key}`（仅 admin）

请求体同上（不含 key），更新 mode/label/description/sort。

#### DELETE `/api/v1/tags/admin/tag-keys/{key}`（仅 admin）

删除标签键（同时删除该键下**未被引用**的标签值）。

安全规则：
- `author` / `version-of` 保留 key → 409
- 键下存在被 demo 引用的标签 → **409 + 引用数量**，禁止删除（不做级联删除）
- 成功返回 204

#### DELETE `/api/v1/tags/admin/tag-keys/{key}/values/{value}`（仅 admin）

删除某个标签值。

安全规则：
- `author` / `version-of` 保留 key → 409
- 该 value 被 demo 引用 → **409 + 引用数量**，禁止删除
- 成功返回 204

#### POST `/api/v1/tags`（仅 admin）

新增**固定值**标签（`fixed` 模式的候选 value）：
```json
{ "key": "type", "value": "game", "description": "小游戏类" }
```
`open`/`int` 键无需预定义 value（用户提交时自动创建）。

#### 发布/编辑 demo 的 tags 字段

`tags` 为 JSON 数组，元素支持两种形式：

1. 字符串：`"model:DeepSeek-V4"`（固定值用这种即可）
2. 对象（**open/int 创建时可选带介绍**）：
```json
[
  "model:DeepSeek-V4",
  { "key": "game", "value": "mc", "description": "我的世界像素风地图" },
  { "key": "rounds", "value": "3" }
]
```

规则：
- `fixed`：value 必须在候选中（介绍以管理员维护为准，忽略传入 description）
- `open` / `int`：value 首次创建时写入 description；**已存在的 value 不覆盖**（保留首次/管理员设置）
- 后端按键定义强制校验（未知 key / 非整数 → 422）

### 前端建议

- 发布/编辑页：`GET /tags/tag-keys` 渲染选择器
  - `fixed` → 候选 value 多选 chips
  - `open` → 文本框 + 添加
  - `int` → number 输入 + 添加（提交前可本地校验整数）
  - 组装成 `key:value` 数组提交
- 标签主页 `/tags`：按 tag-keys 分组展示（hero = label + description），value chips 链接到 `/tag/{key}/{value}`
- 标签详情页 `/tag/{k}/{v}`：hero 标签文本 + 介绍 + 关联 Demo 瀑布流
- 管理后台可加「标签键管理」（POST/PUT/DELETE 已就绪）

## 5. Demo 类型扩展 + 丰富信息

### demo_type（web / zip / link）

`demo_type` 决定 Demo 的托管/展示方式：

| 类型 | 含义 | 必填 | 预览/展示 |
|---|---|---|---|
| `web`（默认） | 网页应用 | zip（根目录需含 index.html）**或单个 .html/.svg** | iframe 在线预览 + 下载 |
| `zip` | 文件包（不大的 zip，无需 index.html） | zip（解包后仅提供下载） | 无 iframe，展示「文件包项目」+ 下载 ZIP |
| `link` | 外部链接（服务器不存内容） | `external_url`（http/https） | 「打开链接」按钮跳转，无下载 |

> **单文件模式**：`web` 类型可直接上传单个 `.html` 或 `.svg`（按后缀自动识别，无需新增类型）。单 HTML 会存为 `index.html`、单 SVG 存为 `index.svg` 并直接预览；下载返回原文件（不打包 zip）。**单 HTML 必须自包含**（内联 CSS/JS，双击可直接打开）。from-url 用 `file_url` 字段传单文件 URL。

### 新增表单字段（create/update demo）

```
POST /api/v1/demos        （multipart/form-data）
PUT  /api/v1/demos/{slug} （multipart/form-data）

title        必填
description  可选
tags         可选 JSON（见第 4 节）
demo_type    web | zip | link（缺省 web）
external_url 可选；link 类型必填且必须 http(s)
prompt       可选，第一轮提示词（详情页展示为提示词卡片）
video_url    可选，介绍视频链接（服务器不存视频，仅存链接）
cover        可选图片
file         可选 zip；web/zip 创建时必填，link 类型禁止上传
commit_message / keep_old_version  同前（编辑时）
```

校验规则：
- `demo_type` 非法 → 422
- link：`external_url` 必填且 http(s)；上传 file → 400
- web/zip：创建时必须上传 zip；web 解压要求含 index.html，zip 不要求
- 更新时若切换类型：link ↔ web/zip 均可；link 下上传 file → 400
- **封面自动压缩**：上传原图受整体上传上限（默认 200MB）约束，后端自动压缩为 WebP（最大边 1280、质量 82），**只保留压缩版**，返回 `/media/covers/xxx.webp`
- **zip 内容去重**（按作者）：同作者上传相同 zip（sha256 原始字节）→ **409** + 已有 demo 链接；`force=1`（仅管理员）可强制上传；link 类型无 zip 不校验；同 demo 自我更新上传相同文件不算重复

### 响应新增字段

```json
{
  "slug": "...",
  "demo_type": "web",
  "external_url": null,
  "prompt": "用 canvas 做一个小游戏…",
  "video_url": "https://www.bilibili.com/video/BV1xxxx",
  "preview_url": "…"   // 仅 web 类型非空；zip/link 为空字符串；web 为版本化 URL /preview/{slug}/v{ts}/index.html
}
```

- 列表接口（`GET /demos`）也会返回 `demo_type` / `external_url` / `prompt`；`sort` 支持 `newest|popular|random|prompt`（`prompt` = 填了提示词的排前面，同组按最新，SQL 层排序跨页稳定）
- 详情接口（`GET /demos/{slug}`）额外返回 `prompt` / `video_url`
- 相关推荐：`GET /demos/{slug}/related?limit=30` → 按标签重合+同类型+热度+随机排序的候选池（排除自身），前端拿整池本地「换一批」，无需再请求
- **DSH 会话轨迹**：上传 zip 时若含 `*.jsonl` / `session*.json` / `trace*.json/l`（如 dsh 导出的 `session.jsonl`），自动提取进该 demo 的「会话日志」；前端对 `.jsonl` 用 DSH 轨迹渲染器展示（用户消息/AI 回复/工具调用/推理/模型信息）
- **会话日志（session logs）**：默认**本地存储**（`storage/demos/{slug}/sessions/`）并服务本地；若启用 OSS 备份（`OSS_ENABLED=true`），log **只存 OSS**（本地不落盘），读取经后端代理 + **每 IP 限流 60 次/小时（429）**，不暴露 OSS 公网直链——防 bot 爬取刷 OSS 下行流量
- **存储模式**：预览/封面/zip 默认**本地服务器下发**（`OSS_SERVE_LOCAL=true`），OSS 仅作**双写备份**（上行不花钱）；`OSS_SERVE_LOCAL=false` 时才直连 OSS 省服务器带宽
- **预览版本化 URL**：`preview_url` 形如 `/preview/{slug}/v{updated_at时间戳}/index.html`；更新 demo 后时间戳变化 → 新 URL，CDN/浏览器可对旧版本长缓存（`immutable`），同时新版本立即生效，不会看到旧文件

### 前端对齐建议

- 发布/编辑页：类型选择（网页应用 / 文件包 / 链接）+ 条件表单（link → 链接地址；web/zip → zip 上传）+ 提示词文本域 + 视频链接输入
- 详情页：
  - `web` → iframe 预览 + 下载
  - `zip` → 「文件包项目」卡片 + 下载按钮
  - `link` → 「打开链接」按钮（`external_url`，新窗口）
  - 信息 Tab：`prompt` 非空时展示「💬 第一轮提示词」卡片；`video_url` 非空时展示「🎬 介绍视频」跳转按钮

## 6. AI Agent 上传指南

### 自发现入口（agent 访问站点即可找到指南）

| 入口 | 路径 | 说明 |
|---|---|---|
| LLM 约定文件 | `GET /llms.txt` | 站点根路径，AI 常用的「给 LLM 的 robots.txt」 |
| robots.txt | `GET /robots.txt` | 含指南路径注释 |
| 首页 HTML | `/` | head 含 `meta[name=ai-agent-guide]` + `link[rel=alternate]`，正文有提示行 |
| API 根 | `GET /api/v1` | 返回 `agent_guide` / `tag_keys` 字段 |
| 指南全文 | `GET /api/v1/meta/agent-guide` | Markdown，最终落点 |

任一入口都能到达指南全文。

### 认证（可选，Bearer Token 免 Cookie）

登录接口返回 `access_token`，后端同时支持 Cookie 与 `Authorization: Bearer <token>`。**上传接口也允许不登录**（见下方「匿名上传」）：

```bash
# 登录拿 token（可选）
curl -s -X POST https://deepdemos.top/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"你的用户名","password":"你的密码"}'
# → {"access_token":"eyJ...","user":{...}}

# 之后所有接口带请求头
-H "Authorization: Bearer eyJ..."
```

### 匿名上传（未注册也能传，public 虚拟身份）

- **不登录也能上传**：`author_id` 为空，作者**恒为 `public`**（不支持自定义昵称），归入 `/author/public` 公开用户页
- public 不能评论、不能编辑/删除（只有管理员能管）
- 放行规则（管理后台两个开关）：
  - `auto_approve`（放行所有）：登录用户 + 匿名都直接上线
  - `auto_approve_public`（放行未注册，默认关）：仅匿名直接上线
  - 都不开：匿名上传进审核队列（`pending`）
- **信任通道**：服务器配置环境变量 `UPLOAD_CODE` 后，匿名上传带 `upload_code` 匹配 → **直接放行**（跳过审核与限流），用于自家/信任的 AI agent
- **限流**：无 `upload_code` 的匿名上传每 IP 每小时最多 20 次（429 拒绝）

### 方式一：JSON + zip URL（推荐 agent 用，免 multipart）

`POST /api/v1/demos/from-url`

```bash
# ① 匿名（最简单，无需登录；作者固定为 public）
curl -X POST https://deepdemos.top/api/v1/demos/from-url \
  -H "Content-Type: application/json" \
  -d '{
    "title": "机械表模拟",
    "description": "AI 生成的机械表网页 demo",
    "demo_type": "web",
    "zip_url": "https://your-oss-or-any-public-host/机械表.zip",
    "cover_url": "https://your-oss-or-any-public-host/cover.png",
    "prompt": "用 canvas 画一个机械表…",
    "idempotency_key": "mech-watch-20240819-001",
    "tags": ["model:DeepSeek-V4", {"key":"game","value":"watch","description":"机械表主题"}]
  }'
# → {"slug":"ji-xie-biao-mo-ni","status":"approved" | "pending","created":true}
# 重试带同一 idempotency_key → {"slug":"ji-xie-biao-mo-ni",...,"created":false}（不重复创建）

# ② 可信 agent（带 UPLOAD_CODE，直接放行）
curl -X POST https://deepdemos.top/api/v1/demos/from-url \
  -H "Content-Type: application/json" \
  -d '{
    "title": "机械表模拟",
    "demo_type": "web",
    "zip_url": "https://.../机械表.zip",
    "upload_code": "你的-UPLOAD_CODE"
  }'
```

- `zip_url` 后端自行下载（限 `max_upload_size` 默认 200MB、60s 超时），**只允许公网 http(s)**：内网/回环/保留地址返回 422（SSRF 防护）
- 封面 `cover_url` 可选；`tags` 支持字符串或对象数组（同第 4 节）
- `demo_type` 规则同第 5 节：web/zip 必填 `zip_url`，link 必填 `external_url` 且禁传 zip
- **AI 上传质量强制**：`description` 必填（非空）、`tags` 至少 1 个——从 URL 通道上传必须带简介和标签，否则 422
- **幂等去重（agent 必用）**：每次上传生成唯一 `idempotency_key`（8~128 位，字母数字 `_ . -`）；请求超时/失败后**用同一 key 重试** → 返回第一次的结果 `created:false`，不重复创建
- **内容去重**：同一作者上传与已有 demo **相同 zip**（sha256）→ **409**，detail 含已有 demo 链接；到 `force:true` + 管理员 token 可强制（`created:true`）

### 方式二：multipart 直传（文件在本地时用）

`POST /api/v1/demos`（同网页上传，字段一致；匿名时加 `upload_code`，作者固定 public）：

```bash
# 匿名直传（不登录；建议带 idempotency_key 防重复）
curl -X POST https://deepdemos.top/api/v1/demos \
  -F "title=机械表模拟" \
  -F "description=AI 生成的机械表网页 demo" \
  -F "demo_type=web" \
  -F "idempotency_key=mech-watch-20240819-002" \
  -F 'tags=["model:DeepSeek-V4"]' \
  -F "prompt=用 canvas 画一个机械表…" \
  -F "file=@D:/path/机械表.zip" \
  -F "cover=@D:/path/cover.png"

# 登录上传则加 -H "Authorization: Bearer <token>"
```

### 查看公开用户的所有 Demo

```
GET /api/v1/demos?status=approved&author=public
```

- `author=public` = 所有未注册上传（`author_id` 为空）
- `author=<用户名>` = 某个注册用户的作品

### agent 流程建议

0. **先抓指南**：`GET /api/v1/meta/agent-guide` → 返回 `AI_AGENT_GUIDE.md` 全文（Markdown），按它执行
1. 生成/打包游戏 → zip
2. zip 放到公网可下载地址（OSS / 临时 http 服务 / GitHub release）
3. 直接 `POST /demos/from-url`（匿名）→ 拿到 `slug`（`pending` 或 `approved`）
4. 若需即时上线：配置并带上 `UPLOAD_CODE`（找站点管理员要）
5. 可选：`GET /demos/{slug}` 校验状态；管理员在后台审核 `pending` 的公开上传

## 7. 站点统计 + 赞助榜（关于本站页）

### GET `/api/v1/stats/visits`（公开，无需登录）

返回站点访问统计：

```json
{
  "today": 168,
  "yesterday": 132,
  "total": 45678,
  "last7": [
    { "date": "2026-08-13", "count": 120 },
    { "date": "2026-08-14", "count": 135 }
  ]
}
```

- `today` / `yesterday`：**页面访问量（原始 PV）**，一次页面浏览计 1；「近 48 小时」由前端 `today + yesterday` 计算
- `total`：累计 PV
- `last7`：近 7 天逐日 PV，**升序（旧→新），当天在最后**，前端画柱状图
- **计数方式**：前端每次路由切换打点 `POST /api/v1/stats/visit`（原始 PV +1，带每 IP 每分钟 30 次限流），后端内存缓冲 + 定时落库，**累加式**（绝不覆盖历史值），跨天滚动，只保留近 90 天；`ips` 字段保留当日去重 IP（UV 备用）

### GET `/api/v1/stats/live`（公开，实时访问）

```json
{ "online": 12, "last1min": 8, "last5min": 35, "today": 168 }
```

- `online`：当前在线人数（最后 2 分钟内有心跳的 IP 数）
- `last1min` / `last5min`：近 1/5 分钟页面访问 PV
- `today`：今日 PV
- 数据在**进程内存**，不落库；单 worker 下有效，多 worker 需 Redis

### POST `/api/v1/stats/heartbeat`（公开）

实时在线心跳：前端每 30s 发一次（fire-and-forget），带每 IP 每分钟 10 次限流；后端仅更新内存在线表。

### GET `/api/v1/stats/sponsors`（公开）

赞助榜：按金额降序。未公开金额（`show_amount=false`）的条目不返回金额字段。

```json
{
  "total_amount": "¥ 1280",
  "updated_at": "2026-08-19",
  "sponsors": [
    { "name": "Alice", "amount": "¥ 500", "message": "支持 AI 全民制作人！" },
    { "name": "Bob", "amount": "¥ 300" }
  ]
}
```

### GET `/api/v1/stats/thanks`（公开）

致谢榜：按添加时间倒序。

```json
{
  "updated_at": "2026-08-19",
  "thanks": [
    { "name": "小明", "message": "感谢提供了这么好的 demo" }
  ]
}
```

### 管理端：赞助 / 致谢（admin only）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/stats/recognition` | 列出全部记录（含下架） |
| POST | `/api/v1/stats/recognition` | 添加 `{kind:'sponsor'\|'thanks', name, amount?, message?, show_amount?, sort?, active?}` |
| PUT | `/api/v1/stats/recognition/{id}` | 更新同字段 |
| DELETE | `/api/v1/stats/recognition/{id}` | 删除 |

- 单表双 kind：`sponsor`（可带 amount、show_amount 隐私开关）/ `thanks`（无金额，带 message 备注）
- `sponsor` 按金额降序 → sort；`thanks` 按 created_at 倒序
- `active=false` 软下架（公开榜不展示）

前端约定：`/stats/visits`、`/stats/sponsors`、`/stats/thanks` 无缓存、不鉴权；失败各自兜底成空态，不阻塞页面。

## 8. 用户评分 + 排行榜

### 评分规则
- 1~5 分整数：5=神作（神）、4=佳作、3=一般、2=差、1=鬼作（鬼）
- 登录用户：一人一个 Demo 一票，可改分/撤分；`rater_key = user:{user_id}`
- 匿名用户：浏览器 localStorage `device_id`（**≥8 位**）+ 客户端 IP + salt 生成 `rater_key`；可改分/撤分；**每 IP 每 demo 限流 10 次/小时，每 IP 全局 60 次/小时**
- 榜单只展示 `status=approved`；质量榜（avg/god/ghost/net）排除 0 评

### 接口

#### 提交/修改评分
`POST /api/v1/demos/{slug}/rating`
```json
{ "score": 5, "device_id": "匿名设备ID(登录用户可不传)" }
```
返回 `{my_score, avg, count, god, ghost, distribution:[{score,count}...]}`（distribution 为 1~5 各档票数，升序，供前端分布条）；再传同分 = 覆盖，点同分取消用 DELETE。

#### 撤分
`DELETE /api/v1/demos/{slug}/rating?device_id=xxx` → 返回更新后的统计。

#### 查看评分
`GET /api/v1/demos/{slug}/rating?device_id=xxx` → 同上（未登录无 device_id 时 my_score=null）。

#### 排行榜
`GET /api/v1/leaderboard?sort=avg|god|ghost|net|count|heat&page=&page_size=`
- `avg` 平均分、`god` 神作票数、`ghost` 鬼作票数、`net` 神票-鬼票、`count` 评分人数、`heat` 浏览+2*下载+评分人数
- 返回标准 `Paginated`，item 为 DemoSummary（含 `rating_avg/count/god/ghost`）

### 数据
- `demos` 冗余列：`rating_sum/count/avg/god/ghost`，随评分事务同步
- `demo_ratings` 表：`UNIQUE(demo_id, rater_key)`，删 demo 级联删评分，删用户评分保留但 `user_id` 置 NULL

## 9. 标签系统升级（可生长 / AI 整理 / 范围检索 / 分布展示）

### 固定值分组与数字值域
- `GET /tags/tag-keys` 的 fixed value 新增 `group`（厂商/分组，如 DeepSeek、OpenAI）
- int 键新增 `min` / `max`（由现有值计算），供前端滑条范围
- `POST /tags`（admin 创建 fixed value）支持 `group` 字段

### 用户申请新固定值（审核流）
- `POST /tags/suggestions`（登录/匿名均可，每 IP 每小时 10 次限流）
  ```json
  { "key": "model", "value": "DeepSeek-V4.1", "description": "…", "group": "DeepSeek", "demo_id": null }
  ```
  只写 `pending` 建议，**不直接创建 Tag**
- `GET /tags/admin/suggestions?status=pending`（admin）列出建议
- `POST /tags/admin/suggestions/{id}/review`（admin）
  ```json
  { "action": "approve", "group": "DeepSeek" }
  ```
  approve → 创建正式 Tag（若不存在），并可选补挂到 `demo_id` 对应 demo；reject → 标记拒绝

### AI 辅助整理（admin，只建议不落库）
- `POST /tags/admin/fetch-models`：把内置主流模型（2026-08 列表）写入 `model` 键的 **pending 建议**（人工审核后生效）
- `POST /tags/admin/ai-suggest`：输入 `{demo_id?|text?}`，返回推荐标签 `{suggestions:[{key,value,reason}], note}`；当前为规则启发式占位，接入真实 LLM 后更准

### 数字标签范围搜索
- `GET /demos?tag=rounds:3-10`：int 键支持 `key:lo-hi` 范围过滤（SQL CAST 数值比较）
- fixed/open 仍为 `key:value` 精确匹配

### 标签 group 管理（admin）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/tags/admin/groups?key=model` | 列出该 key 的 group 分布（含 ungrouped 数） |
| PUT | `/tags/admin/groups/{key}/{group}` | 重命名 group：`{new_group}`，批量更新所有值 |
| DELETE | `/tags/admin/groups/{key}/{group}` | 清除 group（值变无分组） |
| PUT | `/tags/admin/values/{tag_id}/group` | 给单个值设置/清除 group：`{group}` |

### 标签合并（admin）
`POST /tags/admin/merge`
```json
{ "from_key": "model", "from_value": "dsv4flash", "to_key": "model", "to_value": "dsv4-flash", "dry_run": true }
```
- 把源值引用迁移到目标值；demo 已有目标值时删除重复引用；源值删除
- `dry_run=true` 只预览：返回 `{merged, removed_dups, affected_demos, deleted_source, dry_run}`
- 规则：同 key 才能合并；保留 key 禁止；源有子标签禁止；目标不存在 422

### 从 models.dev 同步模型标签（admin）
`POST /tags/admin/sync-models`
- 拉取 `https://models.dev/api.json`（30s 超时、10MB 上限）
- 新模型 → 写入 `model` 键 **pending 建议**（人工审核后生效）
- 已有模型 → 更新 `group`（厂商名）
- 返回 `{providers, total_models, new_pending, updated_group, note}`
- 手动脚本：`scripts/sync_models_from_modelsdev.py`（幂等，可重跑）

## 10. 补充接口（代码已有，文档补录）

> 以下接口在代码中已实现，原文档未列全，现补录。

### 认证 / 用户
- `POST /api/v1/auth/register`（201）：`{username, password}`；用户名重复 409
- `POST /api/v1/auth/logout`（204）：清除登录态
- `GET /api/v1/auth/me`：返回当前登录用户
- `GET /api/v1/users/{username}`：公开用户信息（含 `demo_count`）
- `GET /api/v1/users/{username}/profile`：用户主页聚合（声望/作品/主题/回复/粉丝/关注/is_following）
- `GET /api/v1/users/leaderboard?sort=reputation|likes|thanks|topics|replies|demos|followers`：用户排行榜（分页，仅 active）
- `POST /api/v1/users/{user_id}/follow`：关注/取关切换，返回 `{following, followers_count, following_count}`
- `GET /api/v1/users/{username}/followers`：粉丝列表
- `GET /api/v1/users/{username}/following`：关注列表
- `PATCH /api/v1/users/{user_id}`（仅 admin）：`{role?, status?}`

### 管理后台
- `GET /api/v1/admin/review`：待审核 demo 列表
- `POST /api/v1/admin/review/{slug}`：审核通过/拒绝
- `GET /api/v1/admin/demos`：管理端 demo 列表
- `GET /api/v1/admin/users`：用户管理列表
- `GET /api/v1/admin/settings` / `PUT /api/v1/admin/settings`：`{auto_approve, auto_approve_public, fun_mode}`；PUT 时 `fun_mode` 可省略（null = 保持不变，防旧调用方漏带字段被静默重置）
- `POST /api/v1/admin/oss-sync`：强制全量 OSS 同步
- `GET /api/v1/admin/storage-status`：存储/OSS 状态
- `GET /api/v1/admin/stats`：管理后台概览统计（`{demos:{total,approved,pending,rejected}, users, storage}`）

### Demo / 评论 / 会话日志
- `GET /api/v1/demos/{slug}/download`：下载原始文件（zip 或单文件）
- `GET /api/v1/demos/{slug}/comments`：旧评论树，**只读保留**；`POST /demos/{slug}/comments` 与 `DELETE /comments/{id}` 已下线（410），请用论坛 `/forum/topics`
- `GET /api/v1/demos/{slug}/session-logs`：会话日志列表
- `GET /api/v1/demos/{slug}/session-logs/{filename}`：会话日志内容（每 IP 60 次/小时限流）

### 统计响应结构
- `POST /api/v1/stats/visit`、`POST /api/v1/stats/heartbeat` 返回 `{"ok": true}`
- `GET /api/v1/stats/recognition` 返回 `{"items": [...]}`
- `POST /api/v1/stats/recognition`、`PUT /api/v1/stats/recognition/{id}` 返回 `{"id": ...}`

### 站点
- `GET /api/v1/meta/site-info`：站点公开概况 JSON（`site/content/community/traffic/hot/capabilities/display`，`info_version=1`）。`display.fun_mode` 为整活模式开关（纯前端显示层替换，见 `docs/整活模式.md`）。60s 内存缓存 + `Cache-Control: public, max-age=60`（CDN 可缓存）；仅 admin 可 `?refresh=1` 强刷。只含公开安全数字，管理面统计在 `/admin/stats`。
- `GET /api/v1/health`：存活探针 `{status:"ok", db:"ok"}`；DB 不可用返回 503；`Cache-Control: no-store`（防监控读到缓存假活）。
- `GET /api/v1`（根）已补 `site_info` / `health` 两个字段，供 agent 自发现。

### 标签
- `POST /api/v1/tags` 支持 `parent_id`（层级标签）；返回的是**标签值对象** `TagOut`（含 `id/key/value/description/parent_id/demo_count/child_count/mode`），不是标签键对象

## 11. 已知问题核对（2026-08-28 复核）

> 本节原为审计发现的「文档预期 vs 代码实际」差异清单（13 条）。2026-08-28 逐条复核代码后更新如下状态。

**已修复（代码已与文档对齐）：**

1. ~~`link` 类型创建时未拒绝文件/zip~~ —— `POST /demos`、`POST /demos/from-url` 均已对 link 类型传 `file`/`zip_url`/`file_url` 返回 400。
2. ~~会话日志列表接口未限流~~ —— `GET /demos/{slug}/session-logs` 已加每 IP 60 次/小时限流（与内容接口一致）。
3. ~~`PUT /admin/announcements/{id}` 无法清空 `demo_slug`~~ —— 传 `demo_slug: null` 即置空（代码注释已标明「允许清空」）。
4. ~~`PUT /admin/tag-keys/{key}` 请求体必须带 `key`~~ —— 已改用独立 `TagKeyUpdate` schema，key 以路径为准，请求体无需带 `key`。
5. ~~保留 key 校验不完整~~ —— 已有 `RESERVED_TAG_KEYS = {author, version-of}`；创建/改键/删键/删值/合并均校验。
6. ~~`OSS_SERVE_LOCAL=true` 未完全生效~~ —— `main.py` 的预览子资源与 `/media` 封面均已按 `oss.enabled() and not oss_serve_local` 判断；`true` 时全部源站下发，`false` 时 302 直连 OSS。
7. ~~Docker 后端未安装 git~~ —— `backend/Dockerfile` 已安装 git，站点更新公告容器内可用。
8. ~~排行榜 `range` 参数后端不支持~~ —— `GET /leaderboard` 已接收 `range=all|week|month` 并按 `created_at` 过滤。
9. ~~`_ensure_demo_columns` 迁移漏 `updated_at`~~ —— additions 清单已含 `("updated_at", "DATETIME")`。
10. ~~`max_cover_size` 是死配置~~ —— 该配置已从 `config.py` 整体删除；封面统一受 `max_upload_size`（默认 200MB）约束。
11. ~~commits 死代码残留~~ —— `commits.py`、`git_service.py`、`Commit*` schema、`commit_count` 均已清理，仓库中不存在。

**仍然存在：**

12. **CORS 仅默认本地源**：`config.py` 已有 `cors_origins` 字段（环境变量 `CORS_ORIGINS` 可配置），但 docker-compose 未透传该变量；同源部署（当前线上）不需要，跨源部署需在 compose 增加透传。
13. **`.env.example` 缺配置项**：`RATING_SALT`、`UPLOAD_CODE`、`OSS_ENABLED`、`OSS_SERVE_LOCAL`、`OSS_CUSTOM_DOMAIN`、`PREVIEW_BASE_URL`、`SITE_REPO_DIR`、`CORS_ORIGINS` 等均未列出（`docker-compose.yml` 与 `config.py` 实际都支持）。

**另见 `docs/运维经验与排坑记录.md` §10「线上实测快照」：IP 取值口径、Cookie `Secure` 标志、PV 统计口径（8/22-23 异常峰值已定性为统计方法 bug 并改正，非刷量）等线上行为问题记录。**

## 10. 论坛 + 作品 meta（富卡片）

### 作品 meta（轻量，不增加浏览数）
`GET /api/v1/demos/{slug}/meta` → `{slug,title,cover_url,author}`（仅 approved demo）

### 论坛接口

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/forum/topics` | 公开 | 分页/搜索(q)/分类/标签(tag)/demo 关联/排序(newest\|popular\|replies\|hot)/`sticky=1` 精华/`participated=1` 我参与的/`followed=1` 只看关注，仅 normal |
| GET | `/forum/topics/{id}` | 公开 | 详情（含富卡片字段、赞/感谢计数与我的互动），view_count+1 |
| GET | `/forum/topics/{id}/replies?page=&page_size=` | 公开 | 回复分页（含 `parent_id` 嵌套、赞/感谢计数与我的互动） |
| GET | `/forum/reactions/summary?target_type=topic\|reply&target_id=` | 公开 | 互动汇总 `{like_count, thanks_count, my_reactions}` |
| POST | `/forum/reactions` | 登录 | `{target_type, target_id, reaction_type: like\|thanks}` 切换赞/感谢；返回 `active` + 汇总 |
| POST | `/forum/topics` | 登录 | 发帖（每 IP 10 次/小时），可关联 approved demo_slug |
| POST | `/forum/topics/{id}/replies` | 登录 | 回复（每 IP 30 次/小时），reply_count+1；支持 `parent_id` 嵌套；locked 主题 403 |
| GET | `/forum/admin/topics` | admin | 含 hidden，分页/搜索/状态过滤 |
| PUT | `/forum/admin/topics/{id}` | admin | 改 pinned/sticky/locked/solved/category/status |
| DELETE | `/forum/admin/topics/{id}` | admin | 删主题（回复级联删） |
| DELETE | `/forum/admin/replies/{id}` | admin | 删回复（同步 reply_count） |

### 数据
- `forum_topics`：title/content(Markdown 原文)/author_id/demo_slug/category/tags(逗号分隔)/pinned/sticky/locked/solved/status(normal\|hidden\|reviewing)/reply_count/view_count/created_at/updated_at；输出额外含 `like_count`/`thanks_count`/`my_reactions`
- `forum_replies`：topic_id（级联删）/author_id/content/status(normal\|hidden\|reviewing)/parent_id/created_at；输出额外含 `like_count`/`thanks_count`/`my_reactions`
- `forum_reports`：target_type(topic\|reply)/target_id/reporter_id/reason/status(open\|resolved\|dismissed)
- `forum_reactions`：user_id/target_type(topic\|reply)/target_id/reaction_type(like\|thanks)/created_at；`UNIQUE(user_id,target_type,target_id,reaction_type)`
- `user_follows`：follower_id/following_id/created_at；`UNIQUE(follower_id,following_id)`，级联删
- `users` 扩展：`trust_level`(0=新用户需审核)/`need_review`/`github_bound`/`reputation`(赞+1、感谢+2，取消扣回)
- 权限：发帖/回复必须登录；匿名只读；Markdown 只存原文，前端渲染时消毒
- **审核**：新用户（`need_review` 或 `trust_level<1`）发帖/回复进入 `reviewing`；admin 审核通过后置 `normal` 并提升 trust_level=1
- **链接安全**：发帖/回复内容里的 http(s) 链接会校验——拒绝内网/回环/保留地址，域名黑名单
- **限流**：发帖/回复按「用户 + IP」双维度（10/30 次每小时）；举报 20 次每小时；互动/关注暂不额外限流（登录态）

### 安全/审核接口补充

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | `/forum/reports` | 登录 | 举报主题/回复 |
| GET | `/forum/admin/topics?status=reviewing` | admin | 审核队列 |
| POST | `/forum/admin/topics/{id}/review` | admin | `{action:approve\|reject}` 审核主题 |
| POST | `/forum/admin/replies/{id}/review` | admin | `{action:approve\|reject}` 审核回复 |
| POST | `/forum/admin/users/{uid}/ban` | admin | 封禁用户（status=banned） |
| GET | `/forum/admin/reports?status=open` | admin | 举报列表 |
| POST | `/forum/admin/reports/{id}/handle` | admin | `{action:resolve\|dismiss}` 处理举报 |
| GET | `/forum/admin/replies?topic_id=&status=` | admin | 回复管理列表（含 hidden/reviewing） |

- **首帖初始化**：启动时幂等创建置顶「论坛发帖须知 & 安全说明」（category=notice，内容读取 `docs/论坛首帖-用户须知与安全说明.md`）。
- **限流提示**：429 响应带 `Retry-After` 头 + detail 含剩余冷却秒数。

### 迁移脚本
`scripts/migrate_comments_to_forum.py`：把历史 comments 按 demo_id 归集为论坛主题+回复（**创建/复用主题，保留 author/content/created_at，按 `source_comment_id` 幂等**，重复执行不产生重复楼层；最后检查孤儿评论）。

## 11. 站内通知

### 接口（需登录）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/notifications?unread_only=&page=&page_size=` | 通知列表（分页） |
| GET | `/notifications/unread-count` | 未读数 `{count}` |
| POST | `/notifications/read` | `{id}` 单条已读 |
| POST | `/notifications/read-all` | 全部已读（204） |

### 通知类型与触发
| type | 触发 | 通知谁 |
|---|---|---|
| `forum_reply` | 有人回复你的主题/回复，或 `@用户名` 提及 | 主题作者 + 被 @ 用户 |
| `forum_reaction` | 有人赞/感谢你的主题或回复 | 内容作者 |
| `demo_review` | 新 Demo 待审核 | 所有管理员 |
| `review_result` | 你的 Demo 通过/拒绝 | 作者 |
| `report_handled` | 举报被处理/忽略 | 举报人 |
| `system` | 预留（公告/封禁等） | 相关用户 |

### 数据
- `notifications`：`user_id/type/actor_id/demo_slug?/topic_id?/reply_id?/read/created_at`
- 通知创建走独立事务，**失败静默不阻塞主流程**

## 12. v2 实体接口：Model / Task / Explore（B1 已实现，2026-08-30）

> Model / Task / Prompt 从 Tag 升格为一等实体（方案见 `docs/deepdemosv2/落地计划.md`）。
> **双写兼容**：`model` 标签继续保留并可正常筛选/上传，同时自动同步 `demo_models` 实体关联；
> 序列化新增 `models[]` / `tasks[]` 字段（旧字段全部不变）。

### 模型实体
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/models` | 列表：`?status=&vendor=&q=&sort=demos\|rating\|new\|name&page=&page_size=`；status 缺省展示 active+unverified；含 `demo_count` / `rating_avg` 聚合 |
| GET | `/api/v1/models/{slug}` | 详情：统计 + `aliases[]` + `tasks[]`（参与题目）+ `recent_demos[]`（已序列化） |

### 题目实体（Benchmark = 固定 Task 比较多 Model）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/tasks` | 列表：`?status=&q=&category=&sort=demos\|newest&page=&page_size=`（缺省 active） |
| GET | `/api/v1/tasks/{slug}` | 详情：`compare[]`（**按模型分组对比行**：作品数/平均分/最好作品）+ `demos[]` |
| GET | `/api/v1/tasks/suggest?q=` | 规则层相似任务建议（TF-IDF，纯规则无 LLM；上传页挂题参考） |

### Explore（/tags 原地升级的数据源）
- `GET /api/v1/explore`：`{models:{total,items:Top12}, tasks_total, tasks:Top8, tags:{category,type,game 各 Top12}}`

### Demo 列表增强
- `?model=<slug>` / `?task=<slug>`：按实体过滤
- 标签过滤语义修正：**同一键内 OR、不同键之间 AND**（`tag=model:a&tag=model:b` = a 或 b；`tag=model:a&tag=game:mc` = 且）
- `GET /tags/tag-keys` 新增 `tier`（1 核心 model / 2 常用 type·category·game / 3 扩展其余）——驱动上传页排序、卡片取值、筛选面板

### 同提示词的其他作品（v2 B2′，零 Task 依赖）
`GET /api/v1/demos/{slug}/same-prompt?limit=12` → `{ prompt, prompt_id, items: DemoSummary[] }`

- 语义：`prompt_id` 精确共享 = **同一句提示词交给不同模型**的严格复现对比；与 Task（同题材）构成粗细两档
- `items` 只含 `approved` 且同可见域（astra 橱窗按 `ASTRA_DENY_SEGMENTS` 屏蔽本子路由）的作品，不含自身；按社区分 → 时间倒序
- 无提示词的作品返回 `prompt: "" / items: []`（前端据此隐藏模块，不出空态）
- `prompt_id` 尚未回填的历史行按 `lower(trim(prompt))` 文本兜底匹配；跑过 `migrate_models_v2.py` 后走索引精确匹配

### 数据迁移（服务器执行一次，幂等可重跑）
```bash
docker compose exec backend python /site-repo/scripts/migrate_models_v2.py [--dry-run]
```
行为：`Tag(key=model)` → models/model_aliases/demo_models（迁移批次置 active，ds-unknown → unverified）；`demos.prompt` → prompts 去重回填。上传链路已双写，迁移前后数据不丢失。

## 13. v2 B1.5：治理写接口（Model / Task / 收件箱 / 体检 / 审计）

> 全部 `require_admin`（匿名 401、普通用户 403）。路由薄、业务全在 service：**这些端点是「写操作全走 service」的唯一入口**，前端不得绕过直改实体。
> 依据 `docs/deepdemosv2/评审与重排.md`（批次 B1.5）。

### 实体状态机
- `Model.status`：`candidate`（自动新建/申请，待确认）→ `active`（已确认）｜`unverified`（灰测未验证，照常展示 + canary 徽章）｜`deprecated`（已合并/退役，靠 `merged_into_id` 指向，不物理删除）
- `Task.status`：`candidate` → `active` ｜ `merged` ｜ `hidden`
- 可见性口径：公开 `/models` 缺省只出 `active + unverified`；公开 `/demos` 序列化的 `models[]` 过滤 `deprecated`、`tasks[]` 过滤 `merged|hidden`（退役/已并的实体是空壳，不进新页面）

### Model 管理
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/models?status=&q=&sort=demos\|name\|new` | 管理端列表：**任何状态都可见**（含 candidate/deprecated），返回 `status_counts` |
| POST | `/admin/models` | `{name, vendor?, description?, status?}`；名称或别名已存在 → **409**（引导走合并/加别名，落实「匹配不重复建」） |
| PUT | `/admin/models/{id 或 slug}` | `{name?, vendor?, description?}`；改名会把**旧名自动转为别名**（历史标签值仍可匹配）；目标名被占用 → 409 |
| PUT | `/admin/models/{id}/status` | `{status, reason?}` 状态机迁移 |
| DELETE | `/admin/models/{id}` | 仅零引用实体可删，有引用 → **409**（请走合并） |
| POST | `/admin/models/{id}/aliases` | `{alias}`；重复或等于规范名 → 409 |
| DELETE | `/admin/models/{id}/aliases/{alias}` | 规范名本身不可删（400） |
| POST | `/admin/models/{id}/merge` | `{target_id, dry_run?, reason?}`：`dry_run=true` 返回影响面 `{affected_demos, aliases_moved}`；防呆四项（自身/目标已退役/源已合并过/成环）一律 422 |

### Task 管理
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/tasks?status=&q=&page=&page_size=` | 任何状态；返回 `status_counts` |
| POST | `/admin/tasks` | `{title, description?, category?, status?, demo_ids?}`；**带 `demo_ids` = 建题即挂题**（prompt 簇「一键成题」走这条） |
| PUT | `/admin/tasks/{id 或 slug}` | `{title?, description?, category?, status?}` |
| DELETE | `/admin/tasks/{id}` | 仅零挂载可删，否则 409 |
| POST | `/admin/tasks/{id}/merge` | `{target_id, dry_run?, reason?}`（同 model 合并语义） |
| POST | `/admin/tasks/{id}/demos` | `{demo_ids:[...]}` 批量挂题 → `{attached}` |
| DELETE | `/admin/tasks/{id}/demos/{demo_id}` | 摘题；不在该题下 → 404 |

### 建议收件箱 / 体检 / 审计
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/admin/suggestions?status=pending\|approved\|rejected\|all&kind=&min_confidence=` | 收件箱。`kind ∈ new_model\|new_task\|task_match\|merge_model\|merge_task\|alias`；`source ∈ user\|admin\|ai\|inferred\|external\|imported` |
| POST | `/admin/suggestions/{id}/review` | `{action: approve\|reject}`；**approve 才按 kind 调对应 service 真正落库**，已处理过 → 409 |
| GET | `/admin/knowledge/stats` | 覆盖率 KPI + 实体积压 + 收件箱待处理 + 重复 slug 数（明确不用「标签数量」当指标） |
| GET | `/admin/audit?entity_type=&action=&entity_id=&q=&page=&page_size=` | 审计回溯，含 `before/after` JSON 快照 + `total/actor` 与可选值清单（详见 §20） |

### Prompt 聚类 → 一键成题（v2 B3′）
`GET /api/v1/admin/prompt-clusters?min_score=0.35&exact_min_demos=2&similar_min_demos=3&similar_min_models=2&refresh=1`

两档产物（**全部是建议，绝不自动落库**）：

| 档 | 成立条件 | 依据 |
|---|---|---|
| `exact` | 同一句提示词、≥2 作品，不要求跨模型 | 线上 235 条真实提示词实测：11 个同句簇、其中 8 个跨模型（如「科幻坦克」6 作品横跨 HY4/灰测/Qwen/GLM/Mimo）——零判断成本、质量最高 |
| `similar` | TF-IDF 余弦 ≥ `min_score`，且 ≥3 作品 + ≥2 不同模型 | 0.35 是唯一有质量档位；降到 0.25 仅多 1 簇且混入「反向复合弩 / 双叉臂悬挂台架」这类不同题误簇，0.20 以下基本是噪声 |

返回 `{exact[], similar[], stats}`；簇含 `suggested_title`（高频非停用分词拼的草稿名，仍需人工改名）、`sample_prompt`、`demos[{demo_id,slug,title,models,rating_avg,rating_count,covered}]`、`covered`（已有 active 题目挂载即 true，面板不再主推）。

成题 = 复用 `POST /admin/tasks {title, demo_ids}`（一次调用建题 + 批量挂题），审计照落。
结果 60s 缓存；prompt / 题目任一写路径主动失效（`refresh=1` 强制重算，面板「重新扫描」即走此参）。
模型口径双轨取值：`demo_models` 实体优先、`model:` 标签兜底（迁移未跑时不至于空池）。

### 挑战上传（v2 B4′）
两个上传入口都接受可选 `task`（题目 slug）：multipart 表单字段 `task=` / from-url JSON `"task": "<slug>"`。

- **用户自报不等于挂题权限**：后端**不写 `demo_tasks`**，而是生成一条 `entity_suggestions(kind=task_match, source='user', confidence=0.98)`；管理员在收件箱 approve 后才真正挂题（`suggestion_service._execute` 转调 `task_service.attach_demos`）。任意塞题会污染 Benchmark，故必须过人工
- 校验时机：`task` 在**解压/下载/OSS 之前**校验，非法或题目非 `active` → **422** 且**不留孤儿 demo**；幂等命中（同 `idempotency_key`）直接返回旧结果，不重复入队
- `confidence` 必须是数值：`0.98 < AUTO_ACCEPT(0.99)` 保证只进人工，`> REVIEW(0.60)` 保证默认视图可见；**传 None 会被 `>= 0.6` 过滤掉从而永久隐身**（NULL 语义陷阱，已在测试里锁住）
- 同 `demo + task` 的 pending 建议自动去重，不堆噪音
- 前端链路：Task 页「用你的模型挑战此题」→ `/upload?task=<slug>` → 挑战卡片（题面 + 原题提示词「复制 / 填入」）→ 提交 → 成功态提示「挂题请求待管理员确认」
- 管理端：新 Tab「**收件箱**」（`AdminInboxSection`）——按 status/kind 筛、批准前显示影响面并二次确认、执行走 `POST /admin/suggestions/{id}/review`
- agent 通道的 `task` 字段暂不写进 `AI_AGENT_GUIDE`（定稿 B5′ 再开，避免 Task 池尚浅时 agent 乱挂）

### 置信度分级（建表即定规格，LLM 接入零改表）
- `≥ 0.99` 可自动执行（**必须落审计**）；v2.0 规则层默认**关闭**自动执行——TF-IDF 分数不是概率，误判即不可逆变更，一律走人工
- `≥ 0.60` 进收件箱默认视图；`< 0.60` 只入库（需显式 `min_confidence` 才看到），不骚扰管理员
- 同类同目标 `pending` 建议自动去重；更高置信度只刷新证据，不重复建行

### 视区与安全边界
- **astra 橱窗默认不可见**：`/models`、`/tasks`、`/explore`、`/admin/*` 均不在白名单 → 返回 404（白名单制，新增路由默认堵死，防漏堵）
- **决策（2026-08-31，决策人拍板）**：astra **不放行** v2 路由，橱窗代码整体不动。核实依据：橱窗是**独立 mini-SPA**（`main-astra` + `AstraWorksView/AstraWorkView`），不加载主站 `DemoCard/ModelChips`，站内链接只指向 `/`、`/about`、`/demo/:slug` → 无死链；且 astra 输出层历史上就保留 `model:` 标签（只过滤 `author`/`version-of`），故序列化新增的 `models[]` 不构成新泄露面

## 14. v2 B5′：Run 元数据收编（轮数 / 耗时 / 平台）

`rounds` `time` `platform` 本质是「一次生成过程」的属性而非描述性标签，已收编为 demos 列：

| 列 | 来源标签 | 类型 |
|---|---|---|
| `gen_rounds` | `rounds:` (int) | 整数，同键多值取最大 |
| `gen_minutes` | `time:` (int) | 整数分钟，非数字静默忽略 |
| `gen_platform` | `platform:` (open) | 字符串（截断 32） |

- **写入面不变**：仍按标签提交（`-F 'tags=["rounds:3","time:90","platform:DSH"]'`），系统在 `_set_demo_tags` 里派生列；**`?tag=rounds:3-10` 旧契约继续可用**（不静默失效）
- 新增按列过滤：`?rounds=3-10`、`?minutes=-60`、`?platform=DSH`（语法同 int 标签：`3` / `3-10` / `-10` / `3-`；非法返回不过滤）
- 历史数据回填：`scripts/migrate_models_v2.py` 第 4 步（每次重算，幂等，统计键 `run_meta_filled`）
- **Benchmark 对比行升为三指标**：`compare[]` 新增 `avg_rounds` / `avg_minutes`（AVG 忽略未填 → `null`，绝不用 0 冒充数据），Task 页展示 `DEMO / RATE / ROUND / MIN`
- 迁移：`_ensure_demo_columns` 增三列（SQLite `ALTER TABLE ADD COLUMN`，无新库无新基建）
- 审计与业务**同事务**：审计写失败连带回滚，不允许「合并了但查不到谁干的」

## 15. v2 Q2：模型必填 + 三档兜底

`model` 从「建议填」升级为**必填**，同时给「不确定」三条正门 —— 强制与兜底必须同时落地，否则只会逼人编一个型号。

### 断言强度 `Model.resolution`（与 `status` 正交）

| 值 | 语义 | 载体 | status |
|---|---|---|---|
| `exact` | 精确型号 | 正常实体 | 按流程 |
| `family` | 知厂商不知型号 | `model:<vendor>-unknown`（如 `deepseek-unknown`） | active |
| `unknown` | 完全不知 | `model:unspecified` | active |
| `guess` | 有猜测未证实（网传灰测） | `model:ds-unknown` / `unknown` | **unverified** |

- 兜底位是**真实 Tag 值 + 真实实体**（`model` 是 fixed 键，不进词表就没有正门）
- 启动/迁移自动确保齐备：`unspecified` + 每个已知厂商一个族节点；登记带 `vendor` 的精确型号时自动补齐该厂商族节点
- D（灰测猜测）与 B/C 严格分开：`ds-unknown` 是「灰测揭晓」资产池，不可混入「懒得填」

### 校验规则（三处，均在下发/解压**之前**）

| 入口 | 行为 |
|---|---|
| `POST /demos`（multipart，网页） | 缺 model → **422**，错误文案直接列出三条出路 |
| `POST /demos/from-url`（agent） | 原 `tags≥1` 之外追加 model 必填 → 422 |
| `PUT /demos/{slug}` | 传入 `tags` 时不得清空 model（不传 `tags` 则不动） |

### 证据字段

`model_hint`（≤500 字，可选，multipart 表单字段与 from-url JSON 字段同名）：选兜底位时记依据（如「网传灰测版」「只知是 DeepSeek」「别人传的没写」）。
序列化：`GET /demos/{slug}` 详情新增 `model_hint`；`models[]` 每项新增 `resolution`。

### 统计折叠

- `GET /explore` → `models.fallback_demos`：兜底位作品总数，前端渲染「其他 · 未定 N」折叠行，**兜底位不参与热门模型排名**（`list_models(exclude_fallback=True)` / `fallback_demo_count()`）
- 显示层：`family` → 「厂商 · 未定型号」，`unknown` → 「未标注模型」，`guess` → canary 徽章（`modelDisplay()`）

### 迁移

存量 `resolution` 回填随启动 `_ensure_model_columns()` 自动执行（`ds-unknown → guess` 且纠正 `status=unverified`）；`scripts/migrate_models_v2.py` 幂等可重跑。

## 16. v2 D3：前端路由与 slug 约定

| 路径 | 页面 | 说明 |
|---|---|---|
| `/tags` | **探索**（`ExploreView`） | 数据源 `GET /explore`：模型 Top12 + 题目 Top8 + 描述性标签（category/type/game）；**URL 不变保外链兼容** |
| `/tags/keys` | 标签键浏览（原 `/tags` 页内容下移） | 键/值全量浏览与搜索 |
| `/models`、`/models/:slug` | 模型列表 / 模型页 | 只从探索页、卡片徽章进入，不占顶栏 |
| `/tasks`、`/tasks/:slug` | 题目列表 / 同题对比 | 同上 |

顶栏导航固定 5 项：**首页 / 作品库 / 排行榜 / 探索 / 上传 Demo**（新增一级实体不再加导航位，一律从「探索」下钻）。

**slug 约定**：展示字段可中文（`title`/`name`），**URL slug 必须 ASCII**（`slugify()` 剔除非 ASCII）。中文题面退化为 `task-N`；中文厂商名的族节点用 `vendor-<hash6>-unknown` 避免互相改指向。

`/explore` 返回新增 `models.fallback_demos`（兜底位作品总数）：前端渲染「其他 · 未定型号 / 未标注：N 个作品」折叠行，**兜底位不参与热门模型排名**。

## 17. v2 Q2：归属工作台（兜底位 → 真实型号）

| 端点 | 权限 | 说明 |
|---|---|---|
| `GET /admin/attribution/pending?limit_models=&limit_demos=` | admin | 兜底实体分组清单：每组含实体信息 + 其下已上架作品（带 `model_hint` 证据与 `guess` 规则预填目标）+ 全量可选真实型号 `targets[]` |
| `POST /admin/attribution` `{demo_ids[1..200], target_id, reason?}` | admin | 批量归属；返回 `{moved, demo_ids, target}` |

行为约束：

- **目标必须 `resolution=exact` 且未退役**，否则 422 —— 兜底位之间该走 `merge_model`，不是归属
- **归属 = 回写 `model:` 标签 + 重跑实体双写**，不是只改 `demo_models`：编辑作品时 `_set_demo_tags` 会按标签重新派生实体，只改实体表的归属会在下一次编辑时静默退回兜底位
- **幂等**：作品已在目标型号上时不计入 `moved`；`moved=0` 时**不写审计**（变更日志只记真实变更）
- 每次有效归属写一条 `audit_log(action='attribute', entity_type='model', after={target, moved, demo_ids, from})`，理由字段可追溯「谁把哪些作品从哪个兜底位迁到哪」
- 归属后自动失效别名缓存与聚类缓存
- `guess` 只是**规则预填**（扫 `model_hint`/提示词/标题里的已知型号名/别名，取最长命中），管理员可改；LLM 后置时替换 `guess_target()` 即可

管理端 UI：后台「归属工作台」Tab —— 按兜底实体分组、全选、组内多数猜测作为默认目标、提交前显示影响面并二次确认。

## 18. v2 B4：type:demo 拆分流水线（规则版）

`type:demo` 吞了 44% 的作品（不是分类，是垃圾桶）。流水线把它拆成真实归属，**三段式、绝不自动改标签**。

| 端点 | 权限 | 说明 |
|---|---|---|
| `GET /admin/type-demo/preview?limit=&min_confidence=` | admin | 规则预览，**不写库**：`stats`（当前 type 分布 + demo 占比）、`proposed`（可细分件数）、`by_target`（建议去向计数）、`samples`（前 40 条含命中关键词，可解释） |
| `POST /admin/type-demo/queue?limit=&min_confidence=` | admin | 把建议落成 `retag_demo` 候选进收件箱；返回 `{proposed, queued}`，同 `demo` 的 pending 自动去重 |

### 新候选类型 `retag_demo`

`payload = {demo_id, demo_slug, demo_title, remove:"demo", add:"<新值>", alt:[次优], matched:[命中词], reason}`，`source='inferred'`。
批准时由 `refine_service.apply_retag()` 执行：**只替换 `type` 键的值，其余标签一律不动**；目标固定值不存在则自动补进词表（批准动作即授权，`type` 是 fixed 键）；幂等（已是目标值返回「无需改动」）。

### 审核响应新增瞬时字段

`POST /admin/suggestions/{id}/review` 批准成功时回 `"result": "<实际改了什么>"`（不入库，仅用于前端提示文案，避免 UI 自己编造变更描述）。

### 规则与置信度（真实语料校准）

- 关键词来自 `prompt`(1.0) / `title`(0.9) / `description`(0.7) 三个字段加权；英文按词前缀匹配（`visualiz` 覆盖 visualize），中文按子串
- `category`/`game` 标签只作弱佐证（+0.06），不单独成案
- 置信度：**≥0.85 基本可信**（实测占 80%）、**0.72~0.84 偶有误判**（多为单词命中，如博客站因"物理"二字被判 simulation）→ 管理面板默认 **0.8**，低段建议逐条看
- 命中不到就**不提案**（实测 285 件里 84 件无信号，保持原样），不硬塞值把垃圾桶换个名字继续装
- 14 个目标值：`simulation / visualization / education / music / art / puzzle / strategy / action / card / story / utility / chat / benchmark / spatial`

### 实测效果（637→640 件线上仿真库）

入队 201 条（重扫 0 新增，幂等）→ 批量批准 161 条 0 失败 → **`type:demo` 从 285 件 44% 降到 124 件 19%**，type 值 **5 → 17 个**。
完整性核验：批准后无一例「`demo` 与新值共存」由流水线产生（现存 10 例是线上原有数据，作者同时打了 `demo`+`game`）。

## 19. v2 B4：治理巡检（结构性缺口 → 可处理清单）

与 `GET /admin/knowledge/stats`（体检=读数）分工：巡检出**待办**。

| 端点 | 权限 | 说明 |
|---|---|---|
| `GET /admin/inspection?sample_limit=` | admin | 跑 9 项检查，**只读不写库**；返回 `{approved, total_findings, checks[]}` |
| `POST /admin/inspection/{check_id}/queue?min_confidence=` | admin | 可执行项生成 `retag_demo` 候选进收件箱；**不可执行项返回 422** |

### 检查项与分级

| id | 检查 | level | 能否生成候选 |
|---|---|---|---|
| `type_missing` | 作品没有 type 标签 | action | ✅ 规则补值（默认门槛 0.85，比拆分流水线更高） |
| `type_multi` | 挂了多个 type | action | ✅ 仅处理含 `demo` 的组合（机械判断，置信 0.95） |
| `demo_left` | 仍挂 `type:demo` 且规则无信号 | warn | ❌ 机器没把握 |
| `no_prompt` | 缺第一轮提示词 | warn | ❌ 机器编不出来 |
| `model_fallback` | 挂在兜底型号上的作品 | warn | ❌ 去「归属工作台」 |
| `fixed_no_desc` | 固定值缺少介绍 | warn | ❌ 词表补课需人写 |
| `orphan_values` | 零引用的标签值 | info | ❌ 人工决定清理 |
| `dup_model_slug` | 重复 slug 的模型实体 | warn | ❌ 走合并 |
| `inbox_pending` | 收件箱积压 | info | ❌ 去收件箱批准 |

**设计克制**：`can_queue` 恒等于 `level === 'action'`，其余项调用 queue 一律 422 —— **不为"界面上有按钮"而造一个假动作**。

### 复用的执行通道

`retag_demo` 的 `remove` 现支持字符串或数组，`apply_retag()` 覆盖三种用法：拆分（`add='simulation', remove='demo'`）、纯补值（`remove=[]`）、多值收敛（`remove=['demo'], add='game'`）。执行永远只碰 `type` 键，其余标签不动（有测试锁这条）。

### 真实规模实测（640 件仿真库）

```
type_missing   191 件（30%）→ 规则可补 98 件（≥0.85）
type_multi      28 件 → 其中 10 件含 demo 可机械收敛（入队 8，另 2 件已有 pending 被去重）
demo_left       84 件 → 标为需人工，无自动动作
no_prompt      381 件 / model_fallback 374 / fixed_no_desc 101 / orphan_values 93
重复入队 → queued 0（幂等）；不可执行项 → 422
```

## 20. v2 B4：治理体检面板与审计浏览

管理端补两块只读面板（数据接口原本就有，缺的是界面）。

### 体检 `GET /admin/knowledge/stats`

后台「治理总览 → 体检」。指标刻意选**覆盖率与积压**，不用「标签数量」：

- KPI：已上架数 / 模型覆盖率 / 收件箱待批 / 重复 slug 数
- 覆盖率表：按 `tier` 分组（核心 / 常用 / 扩展），每键给 `demos` 与 `rate`
- 实体健康度：模型 `total/active/unverified/candidate/deprecated`、题目 `total/active/candidate`
- 待批候选构成：`inbox.pending_actionable` 按 kind 明细

### 审计 `GET /admin/audit`（**响应结构本轮变更**）

| 参数 | 说明 |
|---|---|
| `entity_type` | `model` / `task` / `suggestion` |
| `action` | 必须 ∈ `AUDIT_ACTIONS`，否则 422 |
| `entity_id` / `q` | 按对象 ID / 按 `reason` 关键词（LIKE）定位 |
| `page` / `page_size` | 分页（`page_size ≤ 200`）；**旧 `limit` 参数已移除** |

响应：`{items[], total, page, page_size, actions[], entity_types[]}`，每条新增 `actor`（批量解析出的用户名，不是逐行查）。

**单一来源规则**：动作白名单定义在 `models.AUDIT_ACTIONS`，路由的校验 pattern 与前端下拉都从这里取。
缘由：`attribute` 动作上线时漏在硬编码 pattern 里，导致这类记录**筛不出来**（不报错、只是看不见）—— 回归测试 `test_audit_whitelist_covers_every_action_written` 会拿数据库里实际出现过的 action 与常量做差集，漏一个就红。

## 21. v2 B4：合并向导与别名中心（实体治理收口）

### 发现层

`GET /admin/entity-conflicts`（admin）→ `{models[], tasks[], groups}`，每组 `{key, items:[{id,label,demos}]}`。
`key` 是 `normalize()` 后的同键：**两个实体同键意味着第三种写法会分叉到不同实体**，这组数据就是该合并的清单。只报不动手。

### 合并（两端点已存在，界面强制走四步）

`POST /admin/{models|tasks}/{ident}/merge`，body `{target_id, dry_run, reason}`：

1. ① 选源 → ② 选归宿（互斥，不能选到自己）→ ③ **`dry_run=true` 预览**（`affected_demos` / `aliases_moved`）→ ④ 预览出来后「执行合并」才可点
2. 防呆：自合并 422、目标已退役 422、源已被合并过 422、不成环
3. 执行 = 迁引用 + 旧名转别名 + 源转 `deprecated`，单事务 + 审计（`action='merge'`）

### 别名中心

`GET /models/{slug}`（公开详情，含 `aliases: string[]`）+ `POST /admin/models/{ident}/aliases {alias}`（201）+ `DELETE /admin/models/{ident}/aliases/{alias}`（204）。
移除别名前界面会警告后果：**历史里用该写法打的标签将不再指向本实体**（可能落到同键的另一个实体上）—— 这不是 cosmetic 提示，是真的会改变归属。

### 管理端列表（供选择器用）

`GET /admin/models?q=&status=&page_size=` → `{items[], total, status_counts}`（含 `resolution`，candidate/deprecated 可见）；
`GET /admin/tasks?q=&status=&page_size=` → `{items[], total, page, page_size, status_counts}`。

### 实测（真实规模环境）

`dry_run` 预览 `dsv4-flash → dsv4-pro` 显示 `affected_demos=40, aliases_moved=1`；自合并 422；别名「登记 → 详情可见 → 移除 → 完全复原」净零通过；匿名访问冲突端点 401。
另：`dsv4-flash` 的别名表里现在有 `dsv4flash` —— 是上一轮合并自动带过来的，实证「合并后旧写法继续命中历史标签」。

## 22. v2 §4.2：标签建议包（上传第 2 步）

`POST /tags/derive`（**匿名可用、纯只读、不写库**）：

```jsonc
// 请求
{ "title": "", "description": "", "prompt": "", "limit": 8 }
// 响应
{ "items": [ { "key": "type", "value": "music", "label": "音乐音频类",
                "confidence": 0.85, "reason": "描述命中：钢琴、节奏、音乐", "demo_count": null } ],
  "note": "规则推导，仅供参考；不收也不影响提交。" }
```

### 三个来源、一套产物

| 键 | 匹配依据 | 置信 |
|---|---|---|
| `type` | `refine_service.classify`（与拆分流水线**同一个关键词引擎**，14 个细分值） | 0.72~0.9，次选写进 `reason` |
| `model` | **`model:` 词表**的值或介绍出现在文本里 | 0.9 |
| `game/category/plugin/skills/preset` | 词表自匹配：值本身（ASCII 按词边界）或值的**中文介绍**命中 | 0.72~0.88 |

- **为什么 model 查词表而不是实体表**：建议必须落在作者真能点选的候选值上，而实体表要等首次上传才建出来，新库查不到。归属工作台相反（那里要实体 id），所以用 `guess_model`。两个数据源、两种用途，已在代码注释写明。
- **词表自匹配的额外收益**：新登记的固定值自动获得被推荐能力，不必再改代码。
- 边界：文本 <4 字直接返回空；`type` 单值语义只推 top-1（作者已有 type 时前端不再显示）；**不推垃圾桶与兜底值**（`demo` / `unspecified` / `*-unknown`）—— 兜底要作者主动选，不能被"推荐"。
- 短 ASCII 值按词边界命中：`mc` 不会从 "mcdonald" 里跳出来（有测试锁这条）。

### 旧端点归一

`POST /tags/admin/ai-suggest`（admin）现在**委托同一引擎**，响应形态保持 `{suggestions:[{key,value,reason}], note}` 向后兼容。此前它自带一份硬编码 5 值关键词表且命中即 `break` —— 两处规则必然漂移，现已消除。

实测（真实规模环境）：`3d魔方求解 / 用 dsv4-flash…` → `model:dsv4-flash 0.9`、`type:spatial 0.85`、`game:魔方 0.72`；`McDonald` 不误命中 `game:mc`；derive 前后作品数与待批候选数不变（只读）；公开端与管理端对同一文本给出相同 type 建议（同源）。

## 23. v2 D5：组盒语汇的适用边界（防止过度统一）

「面板级标签统一组盒」**不等于所有 chips 都要转**。逐处核对现有界面后的结论：

| 位置 | 形态 | 转组盒 | 理由 |
|---|---|---|---|
| 探索页 描述性标签段 | 面板级标签浏览 | ✅ 已转（盒头 = 键标签） | 与标签页同一语汇 |
| 标签页 / 标签详情页 | 面板级 | ✅ 本来就是 | D5 原生场景 |
| 作品卡片行内（≤3 chips） | 行内 | ❌ 保留 | D5 明确「面板 vs 行内分层」 |
| 详情页 meta 标签区 | 行内 | ❌ 保留 | 同上 |
| 作品库筛选条 | 交互控件 | ❌ 保留 | 筛选器不是标签展示 |
| 模型页 类型/玩法分布 | **数据条**（带数量对比） | ❌ 保留 | 转组盒会丢掉数量可视化，是倒退不是统一 |

## 24. v2 B4 补：撤销合并与改 slug

### 实体解析单一来源（行为变更，需知晓）

`model_service._find_model()` 是**唯一**的实体解析路径：**id → slug → 别名**。公开详情 `GET /models/{slug}`、admin 全部端点、合并/撤销/别名都走它。

**因此 `/models/<别名>` 现在也能打开实体**（过去只有精确 slug 可以）。这不是顺手加的功能，是修漏洞：改 slug 与合并都会产生别名，若详情不认别名，那些"旧链接该继续可用"的承诺就是空的。此前路由与 service **各写了一遍 `Model.slug == slug` 查询**，正是这类承诺落空的结构性原因。

### 撤销合并

| 端点 | 说明 |
|---|---|
| `GET /admin/models/merge-history` | 处于「已被合并」状态的实体：`{source, target, moved_total, movable_back, reliable, reason, restored_status}` |
| `POST /admin/models/{ident}/unmerge` `{dry_run, reason}` | 撤销；`dry_run=true` 返回 `{will_restore, already_moved_away, restored_status, reliable}` |

- 前提：合并审计现在写 `after.moved_demo_ids` —— 没有它，事后无从知道当初迁走了哪几个，撤销就成半截活
- **诚实边界**：早期合并（无该字段）时 `reliable=false`，执行**只恢复实体状态与指针、作品留在归宿**，绝不猜归属；界面也会这么写
- 合并之后若又对作品做过归属：`already_moved_away` 会算出来并**不动它们**（所以必须先预览）
- 审计动作 `unmerge`（已入 `AUDIT_ACTIONS` 单一来源）

### 改 slug

`PUT /admin/models/{ident}` 现接受 `slug`：

- 必须 ASCII 安全：非 ASCII → 422；含非法字符 → 422 且**回一个可用建议**（`a b*c` → 「用 a-b-c」）
- 撞名 → **409**（带占用者名字）
- 成功后旧 slug 自动转为**别名**（配合上面的解析规则，旧链接不失效），审计动作 `slug_set`，理由里写明新旧值与「对外链接会变」

实测（真实规模环境，用一次性实体、语料 640 件未动）：合并→history 可见→撤销预览/执行→源实体回到 `active` 且 `merged_into` 清空；改 slug 后新链接 200、旧链接 200（别名救回）；非法 422 / 需修正 422 / 撞名 409 三条各按其状；`?action=unmerge`、`?action=slug_set` 均能筛出记录。

## 25. v2 优化轮：模型页分页、社区分、论坛回复全局列表

### 25.1 收缩社区分（**排序与展示的唯一口径**）

```
score = (wsum + m·C) / (votes + m)        # 闭式，SQL 可直接 ORDER BY
wsum  = Σ(demo.rating_avg × demo.rating_count)   # 票数加权和
votes = Σ demo.rating_count                      # 该模型收到的总票数
C     = 全站按票数加权的整体均分（先验）
m     = 全站各模型票数的中位数（收缩强度，自适应）
```

- `ModelSummary` 新增 `score` / `votes` / `sample_level`（`none|low|mid|high`，阈值 10 / 50 票）；
  **`rating_avg` 保留原语义**（等权均分）向后兼容，前端不再拿它排序。
- `ModelDetail` 额外回 `prior: {C, m}` —— 让读者能自己验算"为什么 6 票的 4.9 排在 412 票的 4.6 后面"。
- `GET /models?sort=` 接受 `demos | score | rating | votes | new | name`（`rating` 是 `score` 的旧别名）；
  `/explore` 的热门模型改按 `score`（仍排除兜底位）。
- **demo 数不参与分数**（那等于把"多产"当"好用"）；只与分数、票数并列呈现。
- 实测（真实语料）：`C=4.4078 m=15`；`1 票 raw 5.0 → score 4.44`，`77 票 raw 4.66 → 4.66`。

### 25.2 `GET /models/{slug}/demos`（模型页看全）

| 参数 | 说明 |
|---|---|
`sort` | `newest`（默认）/ `score` / `popular`，非法值 422 |
`type` / `game` | 按标签值筛（facet 来源＝详情接口的 `type_dist` / `game_dist`） |
`page` / `page_size` | 默认 24，上限 50 |

返回标准 `Paginated<DemoSummary>`。存在的原因：详情接口原本硬编码 `recent_demos(limit=12)`，
`ds-unknown` 396 件只能看到 3%。**`{slug}` 解析走同一入口**（id/slug/别名 + 合并链），不重复写查询。

### 25.3 合并后的名字匹配必须跟 `merged_into` 链（修静默数据丢失）

- `match_model()` 现在：精确名 → 规范化别名 → **跟随合并链**（深度上限 10）。
- `_alias_map()` 只收**未退役**实体（含别名 join Model 过滤）。
- 原因：合并后源实体仍占着自己的 `name`，旧实现先命中退役实体就返回；而序列化会过滤
  `deprecated` → **用旧写法上传的作品看起来"没有模型"**。别名因此根本没机会生效。
- 只退役、未合并的实体仍解析到它自己（不猜、不误改归属）。

### 25.4 `GET /forum/admin/replies` 改为默认全局

新增 `q`（搜回复内容或**所属主题标题**）、`limit`（默认 50，上限 200）；`topic_id` 变可选。
`ForumReplyOut` 新增 `topic_title`（仅管理端列表填充）。
原因：原实现要求先选主题，上百个主题时等于让管理员先做一遍检索。
同时管理列表**不再逐条算表情反应**（省 N 次查询）。

## 26. 前端路由约定：`pageKey` 不含 query

`App.vue` 的 `<component :key="pageKey">` 原本对非 keepAlive 页面用 `route.fullPath`，
导致**任何 query 变化都整页重挂**（滚动弹回顶部、已填内容丢失、请求重发）。现规则：

- `pageKey = keepAlive ? route.name : (meta.remountOnQuery ? fullPath : path)`
- 视图若依赖 query，必须**自己 watch**（`DemosView` / `ForumListView` / `AdminView` 已补）；
  且自写 query 的页面（如 `DemosView`）其应用函数**必须幂等**，否则自家写入会被当成新导航再触发一次。
- 例外：`/upload` 标了 `meta.remountOnQuery`（它的身份就是 `?slug=`/`?task=`，换参数=换对象）。
- `scrollBehavior` 同步改为：同 path 只改 query → 返回 `false`（不滚动）。

## 27. v2 全站回归体检后的两处补齐（2026-09-02）

### 27.1 `TaskSummary.prompt_excerpt`

题目实体**不存提示词**（题面在它挂的作品上）。而"成题"自动建的题目只有标题、`description` 为空 →
列表页读者无从判断这道题让你做什么。

- `GET /tasks` 每项新增 `prompt_excerpt: str`：取该题下**第一件有提示词的已上架作品**，截 160 字。
- **一次批量查询**覆盖整页（`WHERE task_id IN (...)`），不按任务循环 —— N+1 是本项目反复踩过的坑。
- 前端显示优先级：`description`（作者写的）→ 否则显示 `prompt_excerpt` 并加「题面」标记（不冒充作者描述）。

### 27.2 探索页显示口径必须等于排序口径

`/explore` 的模型排序已改为**收缩社区分**（§25.1），但格子仍显示原始 `RATE 5.0` →
出现"1 件作品 5.0 排在 13 件 4.8 后面"的**页面自相矛盾**。现改为显示 `SCORE 4.66` + 票数，
原始均分放进 `title` 悬浮（要看得懂差异，不必并列两个大数字）。

> 通则：**任何"按 X 排序"的列表，必须显示 X**。显示另一个数就是在制造疑问。

### 27.3 全站回归体检（自动化，非肉眼）

14 个页面 × 6 项检查：内部链接是否命中路由表 / 横向溢出 / 破图 / 裸 `.hint`（>13px）/
未归一过渡时长 / 无可访问名的按钮。结果：

```
130 个内部链接 → 0 个不匹配路由
14 页 → 0 横向溢出（桌面 1440 与手机 390 各测）
0 破图 · 0 裸 .hint · 0 未归一过渡 · 0 无名称按钮
```

体检脚本从 `src/router/index.ts` **读真实路由表**做匹配，而不是凭印象列合法路径 ——
上一轮我自己埋的 `/admin/stats` 死链就是"凭印象"造成的。

## 28. v2 Demo 页第 3 期：`/peek` 紧凑摘要（侧滑预览）

```
GET /api/v1/peek/{kind}/{ident}      kind ∈ model | task | demo   （匿名可读）
```

**为什么新开一个端点而不是复用详情接口**：`/models/{slug}` 带 12 件最近作品 + 任务 + 类型/玩法分布 + 先验；
`/tasks/{slug}` 带整张 Benchmark 对比表；`/demos/{slug}` 带时间线与标签全集。
抽屉只需要"这是什么、多强、三件代表作" —— 让前端拉三种重载荷再各写一套取数与降级，是浪费也是重复实现。

| 字段 | 说明 |
|---|---|
`kind/slug/name/description` | 三种实体共用的最小身份 |
`full_path` | 服务端给跳转路径，前端不自己拼 URL（避免路径规则两处漂移） |
`score/votes/sample_level` | model：与 §25.1 **同一口径**（同一函数算，不另写一套） |
`demo_count/model_count` | task：答过这道题的作品数与模型数 |
`is_prompt_excerpt` | task：`description` 为空时回落题面摘录，**必须显式标注**，不冒充作者描述 |
`demos[]` | 最多 3 件代表作（slug/title/rating/cover），按评分排序 |
`models[]` | demo：该作品的模型（**过滤退役实体**，与全站口径一致） |

错误口径：未知 `kind` → **422**（不猜）；实体不存在 → **404**。

**astra 橱窗**：白名单是 GET + 前缀制且默认拒绝，`/peek` 未列入 → 在 astra 下自动 404，无需额外 DENY 规则。

### 前端约定

- 详情页模型署名与「继续逛」出口用 **◱ 图标**表示"就地预览"，`→` 表示"直接导航" —— 两种动作必须有不同视觉，否则用户无法预期后果。
- 抽屉内给两条出路：**在本页打开**（真的导航）与 **新标签 ↗**（保住当前作品）。
- 打开时焦点移入抽屉、`aria-modal`、Esc 与遮罩点击关闭；动效遵守 §动效规范（150ms ease-out、无淡入面板）。

### 实测（CDP 断言 11/11）

```
署名渲染为 BUTTON ✓   抽屉打开 ✓   URL 未变（没离开本页）✓
本页内容仍在 ✓        社区分+票数呈现 ✓   代表作列出 ✓   焦点入抽屉 + aria-modal ✓
Esc 关闭 ✓   遮罩关闭 ✓   ◱ 打开预览 ✓   「在本页打开」真的导航且关抽屉 ✓
```

## 29. v2 挂题链路打通（第 6 条）+ 两处修复

### 29.1 `GET /tasks/suggest` 现在返回可读字段

```jsonc
[{ "task_id": 1, "slug": "tank-brief", "title": "硬表面科幻坦克试验",
   "category": null, "demo_count": 6, "score": 0.39 }]
```

原实现只回 `{task_id, score}` —— **前端拿到 ID 也无法渲染**，这是它"建好了却长期没人调用"的直接原因。
分层纪律保持不变：`matching_service.suggest_task_for()` 只出算法结果（id + 余弦分，将来换 LLM 只替换这一处），
`task_service.suggest_for_demo()` 负责补齐可读字段并**过滤非 active 题目**（未确认的题不该出现在挂题建议里）。

### 29.2 上传页挂题入口（第 3 步）

- 唯一状态源 `pickedTask`：从题目页带 `?task=` 进来、或在上传页主动选，都写进同一个状态；
  「不挑战这题了」清空它。提交时 `task=<slug>`。
- 填了标题/描述/提示词就**自动出建议**（防抖 320ms，≥8 字触发），也提供关键词手搜与"都不是，我自己找"。
- 文案明确 **挂题是申请**：走 `task_match` 候选，管理员批准后才进同题对比（不是直接挂上）。
- 无匹配时给出口（不挂题也能提交 / 新标签看题目页），且**不会把作者锁死**。

### 29.3 修复：写路径的索引失效从未生效（真 bug）

`bump_task_index()` 原实现只 `_idx["version"] += 1`，而调用方传给 `_ensure_index` 的
正是同一个 `_idx["version"]`（`index_version()` 读它）⇒ 两边永远相等 ⇒ `fresh` 恒真 ⇒
**只有 300s TTL 会重建索引**，新建/改过的题目最长 5 分钟搜不到（而注释写着"由写路径 bump 主动失效"）。

改为：数据代数 `_data_gen` 与"索引构建于哪一代" `_idx["version"]` **分开记**，
`bump_task_index()` 同时把 `_idx["built_at"] = 0` 强制下次读取重建。
回归测试：`test_write_path_actually_invalidates_index`（建索引 → 写新题 → 立刻能搜到）。

### 29.4 修复：上传向导第 4 步渲染崩溃（真 bug，功能不可用级）

`stepProblems` 只定义了键 `1/2/3`，模板与 watcher 无条件读 `stepProblems[step].length`
⇒ 进入第 4 步（核对发布）时 `undefined.length` 抛 `TypeError`，**渲染函数崩溃、整页坏掉**，
表现为"点下一步没反应"，且**上传无法提交**。

修复：补齐键 `4`（并把"还差什么"汇总到核对页），模板与 watcher 全部改 `?.` + `?? 0` 兜底 ——
**一个字典少一个键不该有能力崩掉整页**。

## 30. v2 题目链条视图（第 3 条，方案 A）

`GET /api/v1/tasks/{slug}` 新增 `chain` 载荷：

```jsonc
"chain": {
  "brief": "做一个复杂的硬表面结构的3d科幻坦克…",
  "brief_source": "prompt",          // description=作者写的题面 | prompt=回落基准提示词
  "prompt_id": 12,                    // 基准提示词（出现次数最多的那个）
  "prompt_variants": 2,               // 本题下有多少种不同提示词
  "no_prompt_count": 1,               // 多少件作品没填提示词
  "rows": [{
    "slug": "…", "title": "…",
    "models": [{ id, slug, name, vendor, resolution }],   // 已过滤退役实体
    "prompt_id": 12,
    "same_prompt": true | false | null,   // null = 未填提示词，一致性**未知**
    "prompt_excerpt": "…(120 字)",
    "rounds": 4, "minutes": null,         // 生成过程；缺数据是 null，不用 0 冒充
    "rating_avg": 4.8, "rating_count": 5
  }]
}
```

### 三条设计纪律

1. **题面来源必须诚实**：作者写了 `description` 就用它并标「题面」；没写才回落基准提示词，
   并标「题面（取自作品提示词）」—— 不冒充作者描述。
2. **一致性是 benchmark 的有效性前提，必须显式化**：同一题下若作品用的是不同提示词，
   那就不是严格对比。`same_prompt` 三态（true/false/**null**）—— 未填提示词是"未知"，
   既不算一致也不算不一致；有 false/unknown 时页头给出红字警示。
3. **基准提示词 = 出现次数最多的 `prompt_id`**（并列取更早的），不是"第一件的"，
   否则排序变化会让"谁算一致"随机漂移。

### 前端

题目页 `全部作品` 瀑布被 **`逐件证据` 表**取代：一行一件作品，列 = 链条环节
（模型 → 题面 → 生成过程 → 作品 → 评分），可排序（评分/轮数/标题）、可筛（只看同一题面）。
读表的动作本身就是读链条。

### 一处措辞修正（看图发现）

`按模型对比` 每行的"最好作品"实测都指向同一件 5 模型联合作品 —— 逻辑没错（它是含该模型的最高分），
但"最好作品"会被读成"这个模型自己最好的答案"。改为 **「含此模型的最高分：」**。

