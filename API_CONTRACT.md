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
