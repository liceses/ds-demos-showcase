# 前端对接信息（公告系统 + Demo 修改）

> 本文件给前端开发对接用：后端已实现公告系统与 Demo 修改能力，接口如下。
> 基础前缀：`/api/v1`，认证方式：HttpOnly Cookie `demo_token`（`withCredentials: true`），与现有接口一致。

## 1. 公告系统

### 公告类型（`type` 字段）

| type | 含义 | 产生方式 |
|---|---|---|
| `manual` | 手动公告 | 管理员在后台发布 |
| `auto` | 新 Demo 发布 | 上传 demo 后自动生成，content = demo 标题 |
| `update` | Demo 更新 | 编辑 demo 后自动生成，content = 提交的 commit 信息 |

### 接口

#### GET `/api/v1/announcements`（公开，无需登录）

返回最新的公告列表（最多 50 条，按时间倒序）：

```json
[
  {
    "id": 1,
    "type": "manual",
    "title": "站点公告",
    "content": "欢迎投稿",
    "demo_slug": null,
    "created_by": 1,
    "created_at": "2025-06-01T10:00:00"
  }
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

- 首页顶部展示最近 5 条公告，标注类型徽标（公告/新发布/更新）
- 有 `demo_slug` 的公告渲染为可点击链接 → `/demo/{slug}`
- 管理后台「公告管理」页：发布/编辑/删除手动公告；自动公告只读展示（也可删除）

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
| `commit_message` | string | **更新说明 / commit 信息（可选）** |

返回 204。

> 说明：只要有任何字段变化（`changed=true`），后端会：
> 1. 用 `commit_message`（缺省 "更新 demo"）提交一次 git commit
> 2. 自动生成一条 `type=update` 公告，`content` = commit_message

#### DELETE `/api/v1/demos/{slug}`（作者或 admin）

返回 204，同时清理本地文件与 OSS 对象。

### 前端建议

- Demo 详情页：作者本人或 admin 显示「编辑 / 删除」按钮
- 编辑复用上传页表单：预填标题/描述/标签，zip 可选，新增「更新说明」输入框 → 提交到 PUT
- 删除前 `confirm` 二次确认

## 3. 修改密码（顺带交付）

#### POST `/api/v1/auth/change-password`（已登录）

```json
{ "old_password": "旧密码", "new_password": "新密码（≥8位）" }
```
返回 204；旧密码错误返回 401。前端可在个人主页放「修改密码」表单（个人页已实现简单版）。
