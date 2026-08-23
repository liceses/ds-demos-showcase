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

#### POST `/api/v1/admin/announcements`（仅 admin）

请求体：
```json
{ "title": "公告标题", "content": "公告内容（可选）", "demo_slug": null }
```
返回 201 + 创建的公告对象（`type` 固定为 `manual`）。

#### PUT `/api/v1/admin/announcements/{id}`（仅 admin）

请求体同上，返回更新后的公告对象。

#### DELETE `/api/v1/admin/announcements/{id}`（仅 admin）

返回 204。

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
| `tags` | string | JSON 字符串数组，如 `["model:dsv4-flash","type:game"]` |
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
| `fixed` | 固定值 | 只能选已存在的 value（管理员维护） | `model:dsv4-flash`、`plugin:routing-suite`、`type:game` |
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
    "demo_count": 6,
    "values": [
      { "value": "dsv4-flash", "description": "DeepSeek V4 Flash —— 快速推理", "demo_count": 3 }
    ]
  },
  { "key": "game", "mode": "open", "label": "游戏", "description": "游戏名称（自定义值）", "sort": 6, "demo_count": 2, "values": [{ "value": "pvz", "description": "", "demo_count": 2 }] },
  { "key": "rounds", "mode": "int", "label": "轮数", "description": "生成轮数（必须为整数）", "sort": 7, "demo_count": 1, "values": [{ "value": "3", "description": "", "demo_count": 1 }] }
]
```

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

1. 字符串：`"model:dsv4-flash"`（固定值用这种即可）
2. 对象（**open/int 创建时可选带介绍**）：
```json
[
  "model:dsv4-flash",
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
- **封面自动压缩**：上传原图**无大小限制**（受整体请求上限约束），后端自动压缩为 WebP（最大边 1280、质量 82），**只保留压缩版**，返回 `/media/covers/xxx.webp`
- **zip 内容去重**（按作者）：同作者上传相同 zip（sha256 原始字节）→ **409** + 已有 demo 链接；`force=1`（仅管理员）可强制上传；link 类型无 zip 不校验；同 demo 自我更新上传相同文件不算重复

### 响应新增字段

```json
{
  "slug": "...",
  "demo_type": "web",
  "external_url": null,
  "prompt": "用 canvas 做一个小游戏…",
  "video_url": "https://www.bilibili.com/video/BV1xxxx",
  "preview_url": "…"   // 仅 web 类型非空；zip/link 为空字符串
}
```

- 列表接口（`GET /demos`）也会返回 `demo_type` / `external_url` / `prompt`；`sort` 支持 `newest|popular|random|prompt`（`prompt` = 填了提示词的排前面，同组按最新，SQL 层排序跨页稳定）
- 详情接口（`GET /demos/{slug}`）额外返回 `prompt` / `video_url`
- 相关推荐：`GET /demos/{slug}/related?limit=30` → 按标签重合+同类型+热度+随机排序的候选池（排除自身），前端拿整池本地「换一批」，无需再请求
- **DSH 会话轨迹**：上传 zip 时若含 `*.jsonl` / `session*.json` / `trace*.json/l`（如 dsh 导出的 `session.jsonl`），自动提取进该 demo 的「会话日志」；前端对 `.jsonl` 用 DSH 轨迹渲染器展示（用户消息/AI 回复/工具调用/推理/模型信息）
- **会话日志（session logs）**：默认**本地存储**（`storage/demos/{slug}/sessions/`）并服务本地；若启用 OSS 备份（`OSS_ENABLED=true`），log **只存 OSS**（本地不落盘），读取经后端代理 + **每 IP 限流 60 次/小时（429）**，不暴露 OSS 公网直链——防 bot 爬取刷 OSS 下行流量
- **存储模式**：预览/封面/zip 默认**本地服务器下发**（`OSS_SERVE_LOCAL=true`），OSS 仅作**双写备份**（上行不花钱）；`OSS_SERVE_LOCAL=false` 时才直连 OSS 省服务器带宽

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
    "tags": ["model:dsv4-flash", {"key":"game","value":"watch","description":"机械表主题"}]
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

- `zip_url` 后端自行下载（限 `max_upload_size` 50MB、60s 超时），**只允许公网 http(s)**：内网/回环/保留地址返回 422（SSRF 防护）
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
  -F 'tags=["model:dsv4-flash"]' \
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
- 匿名用户：浏览器 localStorage `device_id` + 客户端 IP + salt 生成 `rater_key`；可改分/撤分；**每 IP 每 demo 限流 10 次/小时，每 IP 全局 60 次/小时**
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
