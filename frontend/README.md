# DS 民间科研成果展示 · 前端

基于 **Vue 3 + TypeScript + Vite** 的单页应用，视觉完全遵循
`../stylepkg/neo-brutalist-playful`（俏皮野兽派）的 SKILL.md 规范：
无圆角、纯黑 4px 边框、硬偏移彩色阴影、轻旋转、高饱和强调色；禁用渐变 / 模糊阴影 / emoji 符号。

## 目录

```
frontend/
  public/favicon.svg
  src/
    api/            # types.ts（与后端契约对齐）+ http.ts（axios）+ mock.ts（占位数据）+ index.ts（统一出口）
    components/     # DemoCard / TagChip / IframePreview / MarkdownView / CommitTimeline / CommentTree
    router/         # 路由 + 鉴权守卫（/upload 需登录，/admin 需 admin）
    stores/auth.ts  # Pinia 用户状态（HttpOnly Cookie 语义，无 localStorage token）
    views/          # Home / Demo / TagList / TagDetail / Login / Register / User / Upload / Admin / NotFound
    style.css       # neo-brutalist-playful 设计系统
```

## 运行

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # vue-tsc --noEmit
npm run build      # 产出 dist/
npm run preview    # 预览构建产物
```

## Mock 模式 / 真实后端

- 默认 **Mock 模式**（`VITE_USE_MOCK` 缺省为 true）：内置 6 个占位 Demo、标签层级、
  评论树、session log、Git 时间线，无需后端即可浏览全部页面。
- 连接真实后端：复制 `.env.example` 为 `.env`，设 `VITE_USE_MOCK=false`，然后启动
  后端（FastAPI，见 `../../项目计划书.md`）。

## 与后端协作（契约对齐点）

| 前端 | 后端 |
|---|---|
| `GET /api/v1/demos` | 瀑布流列表（status/tag/q/sort/page） |
| `GET /api/v1/demos/:slug` | 详情 + 原子 view_count |
| `POST /api/v1/demos` | multipart 上传，走状态机 |
| `GET /api/v1/demos/:slug/commits` | 生成过程时间线 |
| `GET /api/v1/demos/:slug/session-logs` | 会话日志 |
| `GET/POST /api/v1/demos/:slug/comments` | 评论树 |
| `GET /api/v1/tags` | 标签分组列表 |
| `/auth/login /register /logout /me` | Cookie 鉴权（HttpOnly） |
| `/admin/*` | 审核 / 设置 / 用户 / Demo 管理 |

- 预览 iframe：真实模式加载 `/preview/<slug>/index.html`；Mock 模式使用内置 `srcdoc`。
- dev 代理已配置：`/api`、`/preview`、`/media` → `http://localhost:8000`。
- 前端不做数据渲染裸 `v-html`：所有 Markdown 经 `marked` + `DOMPurify` 后输出。

## 当前范围

- 已实现：全部页面 + Mock 数据 + 类型对齐 + 可构建；生产由 nginx 托管（`Dockerfile` + `nginx.conf`），部署见 `../DEPLOY.md`。
- 未实现（后续）：HTTPS/TLS、安全响应头、限流、CI/测试。
