# 部署到 Cloudflare（Worker 全栈版）

> 不再用 Pages 单独部署静态页。
> 现在是一个 **Cloudflare Worker**：同时托管前端静态资源 + `/api/v1` 后端 API + `/preview` + `/media`。
> 数据：D1 数据库 + R2 对象存储。

## 一次部署，包含全部内容

```
frontend/
├── dist/             # Vue 构建产物（Worker 的静态资源）
├── worker/index.ts   # 后端 API（Hono）
├── wrangler.toml     # Worker 配置（D1 + R2 + assets）
└── .env.production   # VITE_USE_MOCK=false（生产走真实后端）
```

## 首次部署步骤

### 1. 登录 Cloudflare

```powershell
cd web/frontend
npx wrangler login
```

### 2. 创建 D1 数据库

```powershell
npx wrangler d1 create ds-demos
```

会输出类似：

```
✅ Created database 'ds-demos' at <id>
```

把输出的 `database_id` 填到 `frontend/wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "ds-demos"
database_id = "粘贴你的 database_id"
```

### 3. 创建 R2 存储桶

```powershell
npx wrangler r2 bucket create ds-demos-files
```

### 4. 构建前端（生产模式，连真实 API）

```powershell
cd web/frontend
npm run build
```

### 5. 部署

```powershell
npx wrangler deploy
```

部署完成后会输出 `https://ds-demos-showcase.<你的子域>.workers.dev`。

## 更新流程

改代码后：

```bash
cd web/frontend
npm run build
npx wrangler deploy
```

> 如果以后想配 GitHub Actions 自动部署，可以在 push 时自动跑上面的 build + deploy。

## 本地开发不变

- 本地仍用 FastAPI 后端：`web/start-dev.ps1` 启动前后端。
- Cloudflare Worker 是另一条部署通道，和本地 FastAPI 互不影响。

## 默认账号

- 管理员：`admin / admin123`（首次部署自动 seed）
- 初始标签自动写入。

## 注意

- `wrangler.toml` 里的 `database_id` 是敏感配置，建议提交仓库时保留占位符，或用 CI secret 替换。
- Worker 上传大小限制约 100MB，demo zip 不要超过这个值。
