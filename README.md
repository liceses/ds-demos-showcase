# DS 民间科研成果展示

AI 网页 Demo 展示站：Vue3 前端 + FastAPI 后端。

## 目录

```
web/
├── frontend/        # Vue3 + Vite 前端（已由另一 agent 完成）
├── backend/         # FastAPI 后端（含 API、预览、媒体、git）
├── backend-design.md# 后端设计/契约文档
├── start-dev.ps1    # 一键启动脚本（PowerShell）
└── start-dev.bat    # 一键启动脚本（双击入口）
```

## 一键启动（开发环境）

Windows 双击 `start-dev.bat`，或在 `web/` 下执行：

```powershell
./start-dev.ps1
```

脚本会自动：
1. 准备后端虚拟环境（优先 uv，缺失时退回系统 Python）并安装依赖
2. 写入 `frontend/.env` 的 `VITE_USE_MOCK=false`
3. 前端缺依赖时自动 `npm install`
4. 启动后端 `http://127.0.0.1:8000` 和前端 `http://localhost:5173`

启动后：
- 前端页面：http://localhost:5173
- API 文档：http://127.0.0.1:8000/docs
- 默认管理员：`admin / admin123`

> 手动启动也可参考 `backend/README.md`。

## 说明

- 登录目前是本地账号体系（已撤回微信登录）。
- 上传 Demo 会自动解压 zip（要求根目录有 `index.html`）、附加 `author:{username}` 标签、初始化 git 仓库并提交。
- 正式部署前请修改 `backend/.env` 的 `JWT_SECRET` 和管理员密码。
