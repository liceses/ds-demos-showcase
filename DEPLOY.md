# 部署到 Cloudflare Pages（前端试水版）

> 当前后端是 FastAPI，不能直接部署到 Cloudflare。本次先用 **Mock 模式**把前端部署到 Pages，
> 用于验证公网访问与“改代码 → push → 自动更新”的流程。
> 后端方案（Workers 重写 / 阿里云服务器）之后再定。

## 前提

- 已把本仓库推到 GitHub（见下文）
- 有 Cloudflare 账号

## 步骤

### 1. 推到 GitHub

```bash
cd web
git init
git add -A
git commit -m "init: DS 民间科研成果展示 monorepo"
# 在 GitHub 新建空仓库后：
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 2. Cloudflare Pages 连接仓库

1. 登录 Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授权选择刚才的仓库
3. 构建设置：
   - **Framework preset**：`Vite`（或选 None）
   - **Root directory**：`frontend`
   - **Build command**：`npm install && npm run build`
   - **Build output directory**：`dist`
4. 保存并部署，等几十秒就能拿到 `https://<project>.pages.dev` 地址

### 3. 验证更新流程

- 本地改任意前端代码 → `git push`
- Cloudflare 自动重新构建，约 1 分钟内线上生效
- 也可在 Pages 后台 **Deployments** 里看每次构建状态

## 说明

- `frontend/.env.production` 已设 `VITE_USE_MOCK=true`，所以部署版用的是前端内置 Mock 数据，不需要后端。
- 本地开发仍是真实后端（`frontend/.env` 里 `VITE_USE_MOCK=false`），两者互不影响。
- 以后上真实后端时，把 `.env.production` 改成 `VITE_USE_MOCK=false` 并把 API 基地址指到后端，重新部署即可。
