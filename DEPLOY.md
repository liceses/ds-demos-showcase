# 部署指南（云服务器 + Docker Compose + nginx）

> 现状：前端由 **nginx** 静态托管并反代 **FastAPI**；数据库 **SQLite**（docker volume）；文件存储本地 `storage/`（demo 文件 / 封面 / 会话日志）。
> 仓库内 `docker-compose.yml` + `frontend/nginx.conf` 即当前线上拓扑。早期「Cloudflare Worker + D1 + OSS」方案**已弃用**，见文末历史说明。

## 架构

```
浏览器 → Nginx(:80)
          /api、/preview、/media → backend:8000（FastAPI）
          /assets                → 静态（长缓存）
          其余                    → SPA 回退 index.html
```

## 首次部署

### 1. 准备环境变量（重要）

在 `web/` 下创建 `.env`（docker compose 自动读取做变量替换），至少：

```bash
JWT_SECRET=<强随机串>        # 必须！compose 兜底值是公开的 please-change-me
AUTO_APPROVE=false           # 生产建议关闭自动审核（新上传需管理员通过）
```

生成密钥：`openssl rand -hex 32`

> compose 里的 `OSS_*` 为可选配置：配置后 demo 文件/封面**双写备份到阿里云 OSS**（上行免费，作为备份）；`OSS_SERVE_LOCAL`（默认 `true`）让预览/下载**走本地服务器**，不产生 OSS 下行费用。会话日志在启用 OSS 备份时**只存 OSS**。不配置 `OSS_*` 则全部使用本地 `storage/`。

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
4. **配 HTTPS（强烈建议）**：当前 `nginx.conf` 仅监听 80，登录凭据与 Cookie 明文传输。可用 certbot（Let's Encrypt）为 `deepdemos.top` 发证书并改 nginx 配置：
   - `listen 443 ssl; ...` + `return 301 https://$host$request_uri;`（80 跳转）。
5. 建议后续补：登录/上传/评论/下载限流、zip 解压防护（压缩比/条目数/符号链接）、安全响应头（CSP/nosniff 等）、`/health` `/ready`、审计日志。这些属于"生产规范"项，当前代码尚未实现。

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
