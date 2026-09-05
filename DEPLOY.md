# 部署指南（云服务器 + Docker Compose + nginx）

> 现状：前端由 **nginx** 静态托管并反代 **FastAPI**；数据库 **SQLite**（docker volume）；文件存储本地 `storage/`（demo 文件 / 封面 / 会话日志）。
> 仓库内 `docker-compose.yml` + `frontend/nginx.conf` 即当前线上拓扑。早期「Cloudflare Worker + D1 + OSS」方案**已弃用**，见文末历史说明。

## 架构

```
浏览器 → Nginx(:80)
          /api、/preview、/media → backend:8000（FastAPI）
          /assets                → 静态（长缓存）
          其余                    → SPA 回退 index.html
demo.deepdemos.top → Nginx 独立 server 块 → /preview、/media 反代 backend（预览隔离域）
```

## 首次部署

### 1. 准备环境变量（重要）

在 `web/` 下创建 `.env`（docker compose 自动读取做变量替换），至少：

```bash
JWT_SECRET=<强随机串>        # 必须！compose 兜底值是公开的 please-change-me
COOKIE_SECURE=true           # 必须！全站 HTTPS（回源 http）时登录 Cookie 才带 Secure 标志
AUTO_APPROVE=false           # 生产建议关闭自动审核（新上传需管理员通过）
# 可选：
# OSS_ENABLED=true/false     # 总开关；false 强制纯本地
# OSS_SERVE_LOCAL=true       # zip 下载走本地，OSS 仅备份（默认 true）
# UPLOAD_CODE=<信任通道密钥>  # 匿名 AI agent 免审核上传
# RATING_SALT=<随机串>       # 匿名评分指纹盐
# SITE_REPO_DIR=/site-repo   # 站点仓库只读挂载（站点更新公告用）
```

生成密钥：`openssl rand -hex 32`

> compose 里的 `OSS_*` 为可选配置：配置后 demo 文件/封面**双写备份到阿里云 OSS**（上行免费，作为备份）；`OSS_SERVE_LOCAL`（默认 `true`）= zip 下载、预览子资源、封面全部**由源站下发**，不产生 OSS 下行费用；`false` = 三者 302 直连 OSS 省服务器带宽（需公有读桶）。`main.py` 的预览子资源与 `/media` 已遵守该开关（2026-08 修复）。会话日志在启用 OSS 备份时**只存 OSS**（经后端代理限流读取，不暴露直链）。不配置 `OSS_*` 则全部使用本地 `storage/`。
>
> **2026-08-28 线上实测**：deepdemos.top 当前为 `OSS_SERVE_LOCAL=true` 模式——子资源/zip/封面均由源站 200 直出（前置 Cloudflare 缓存），OSS 仅双写备份 + 会话日志。

### 2. 构建并启动

```bash
cd web
docker compose up -d --build
```

- 前端对外 `:80`（nginx）
- 后端容器内 `:8000`，不对外，由 nginx 反代

### 3. 域名解析

把域名（如 `deepdemos.top`）的 A 记录指向服务器公网 IP。

### 4. 首次登录必做（安全）

- **改 admin 默认密码**（前端「设置」页已有改密接口；也可用容器内 Python）：

  ```bash
  docker compose exec backend python - <<'PY'
  from app.security import hash_password
  from app.database import SessionLocal
  from app.models import User
  db = SessionLocal()
  u = db.query(User).filter(User.username == 'admin').first()
  u.password_hash = hash_password('在这里填一个新强密码')
  db.commit()
  print('admin password updated')
  PY
  ```

- 确认 `AUTO_APPROVE=false`（否则新上传的 Demo 直接公开）。

## 更新

```bash
cd web && git pull && docker compose up -d --build
```

## 上线前安全清单

1. `JWT_SECRET` 改为强随机值（见上）。
2. 修改 `admin` 默认密码（前端「设置」页可直接改）。
3. `AUTO_APPROVE=false`。
4. **HTTPS**：线上已由 **Cloudflare 提供全站 HTTPS**（边缘终止；`nginx.conf` 仅监听 80，回源为 HTTP）。浏览器 → Cloudflare 已加密，Cloudflare → 源站为明文。Cookie `Secure` 标志由 `COOKIE_SECURE` 控制（2026-08 已修）：服务器 `.env` 设 `COOKIE_SECURE=true`（compose 已透传），或自配 TLS 后由 `X-Forwarded-Proto` 自动判定。若脱离 Cloudflare 部署，需自配 TLS——certbot 为 `deepdemos.top` 发证书并改 nginx：`listen 443 ssl; ...` + `return 301 https://$host$request_uri;`（80 跳转）。
5. 建议后续补：zip 解压防护（压缩比/条目数/符号链接）、安全响应头（CSP/nosniff 等）、`/health` `/ready`、审计日志。这些属于"生产规范"项，当前代码尚未实现。
6. ~~后端容器未安装 `git`~~ **已修复**：`backend/Dockerfile` 已安装 git，`site_git.py` 的站点更新公告（站点仓库 commit 信息）在容器内可用。

## 备份

- **数据库（SQLite 在线一致快照 → storage 卷的 backups 目录）**：

  ```bash
  docker compose exec -T backend python - <<'PY'
  import sqlite3, time, os, shutil
  t = time.strftime("%Y%m%d-%H%M%S")
  src = sqlite3.connect("/app/data/app.db")
  dst = sqlite3.connect(f"/tmp/app-{t}.db")
  src.backup(dst); dst.close(); src.close()
  os.makedirs("/app/storage/backups", exist_ok=True)
  shutil.copy(f"/tmp/app-{t}.db", f"/app/storage/backups/app-{t}.db")
  print("backup ok:", t)
  PY
  ```

- **文件**：将 `demo-storage` 卷（demo 文件 / 封面 / 会话日志 / backups）定期 rsync 或打包到异机。

> 注意：上面备份落在 storage 卷内，仍建议额外把卷导出到异地（`docker run --rm -v <项目>_demo-storage:/s -v $PWD:/b alpine tar czf /b/storage.tgz -C /s .`，DB 同理用 demo-data 卷）。

## 历史方案（已弃用）

原「Cloudflare Worker 全栈（Hono + D1 + 阿里云 OSS）」部署方式见 git 历史（自 commit `04c4bc2` 起，`wrangler.toml`、`frontend/worker/` 等）。现线上以本文件的 Docker Compose + nginx 为准。

## 安全待办（2026-09-05 登记，勿遗漏）

### 1. OSS AccessKey 轮换（⚠️ 已泄露，最高优先）

- **背景**：已弃用的 Cloudflare Worker 方案残留 wrangler.toml L20 明文提交了阿里云 OSS AccessKey ID（LTAI5t7…，Secret 走 wrangler secret 未泄，但 ID 本身不应入库）。该凭据对已弃用方案而言纯属暴露面。
- **处置步骤**：
  1. 登录阿里云 RAM 控制台，**禁用并轮换**该 AccessKey（创建新 Key，删除旧 Key）；
  2. 若 OSS 仍在使用（OSS_SERVE_LOCAL=false 场景），用新 Key 更新 web/.env 的 OSS 配置并重启 backend；
  3. 从仓库历史清除 wrangler.toml 中的 Key ID（git filter-repo 或接受历史留存但确保 Key 已失效——**Key 失效是唯一硬保障**）；
  4. 确认 rontend/worker/ + wrangler.toml 死代码已从工作区移除（重构批已标记，随收尾批清理）。
- **验收**：RAM 控制台该 Key 状态=已删除；仓库内无有效凭据。

### 2. 计数修复部署备忘（2026-09-05）

- 部署前**备份 app.db**（docker compose exec backend cp /app/data/app.db /app/data/app.db.bak）；
- 09-04~部署窗口的计数增量无法找回（内存批次设计固有代价）；
- 部署后验证：浏览/下载一个 demo → 30s 后计数落库、重启不归零。
