# 部署到 Cloudflare（Worker 全栈 + 阿里云 OSS）

> 一个 **Cloudflare Worker** 同时托管前端静态资源 + `/api/v1` API + `/preview` + `/media`。
> 数据库用 **D1**，文件存储用你已有的 **阿里云 OSS**（不需要 Cloudflare R2，也不需要信用卡）。

## 架构

```
浏览器 → Cloudflare Worker
         ├── 前端静态资源（dist，assets）
         ├── /api/v1   → D1（元数据/用户/评论/提交）
         └── /preview /media /下载 → 阿里云 OSS（zip/解压文件/封面/session log）
```

## 首次部署

### 1. 登录 Cloudflare

```powershell
cd web/frontend
npx wrangler login
```

### 2. 创建 D1 数据库

```powershell
npx wrangler d1 create ds-demos
```

把输出的 `database_id` 填到 `frontend/wrangler.toml`。

### 3. 配置阿里云 OSS

在 `frontend/wrangler.toml` 的 `[vars]` 里填：

```toml
[vars]
OSS_ENDPOINT = "oss-cn-hangzhou.aliyuncs.com"   # 你的 region endpoint
OSS_BUCKET = "你的 bucket 名"
OSS_ACCESS_KEY_ID = "你的 AccessKey ID"
```

AccessKey Secret **不要写进仓库**，用命令设置成 Worker 加密变量：

```powershell
npx wrangler secret put OSS_ACCESS_KEY_SECRET
```

> OSS 需要是**私有读写**权限即可（Worker 通过签名访问，不公开 bucket）。

### 4. 构建前端（生产模式，连真实 API）

```powershell
cd web/frontend
npm run build
```

### 5. 部署

```powershell
npx wrangler deploy
```

完成输出 `https://ds-demos-showcase.<子域>.workers.dev`。

## 更新流程

```bash
cd web/frontend
npm run build
npx wrangler deploy
```

## 网页版（Dashboard）也可以

如果你不想用命令行：

1. Workers & Pages → D1 → 创建 `ds-demos`，复制 database_id
2. GitHub 里编辑 `frontend/wrangler.toml`，填上 database_id 和 OSS 三个值
3. Workers & Pages → Create application → Worker → 选仓库
4. 设置：
   - Path：`frontend`
   - Build command：`npm install && npm run build`
   - Deploy command：`npx wrangler deploy`
5. 部署后在 Worker 设置里添加加密变量 `OSS_ACCESS_KEY_SECRET`

## 默认账号

- 管理员：`admin / admin123`（首次部署自动 seed）
- 初始标签自动写入。

## 使用 RAM 子用户 AccessKey（推荐，最小权限）

不要用主账号 AccessKey，建一个只访问 OSS 的 RAM 子用户：

1. 打开 RAM 控制台：https://ram.console.aliyun.com/users
2. **创建用户**：登录名随意（如 `ds-demo-oss`），访问方式勾选 **OpenAPI 调用访问**（会生成 AccessKey）
3. 创建后**立即复制 AccessKey ID 和 Secret**（Secret 只显示一次）
4. 给该用户授权：
   - 简单方式：直接添加系统策略 **AliyunOSSFullAccess**
   - 更安全的自定义策略（推荐）：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:GetObject",
        "oss:PutObject",
        "oss:DeleteObject",
        "oss:ListObjects"
      ],
      "Resource": [
        "acs:oss:*:*:你的bucket名",
        "acs:oss:*:*:你的bucket名/*"
      ]
    }
  ]
}
```

5. 把 RAM 用户的 AccessKey ID 填到 `wrangler.toml`，Secret 用 `wrangler secret put OSS_ACCESS_KEY_SECRET` 设置

## 注意

- Worker 请求体大小限制约 100MB，上传的 demo zip 别超过。
- OSS 会按量计费，但你有免费额度；注意 AccessKey 只给 Worker 用最小权限。
