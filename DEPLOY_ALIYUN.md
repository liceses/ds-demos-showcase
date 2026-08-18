# 阿里云一键部署（FastAPI + 前端 Nginx + Docker）

> Cloudflare workers.dev 在国内直连不稳定/被墙，所以最终选择**阿里云服务器**部署。
> 本方案直接用现成的 FastAPI 后端 + Vue 前端，数据/文件放服务器本地卷（后续可平滑接 OSS）。

## 你需要准备

1. 阿里云轻量应用服务器（99 元/年那档即可，2G 内存够用）
2. （可选但推荐）一个域名 + ICP 备案（不备案只能用 IP:端口，正式上线需要备案）

## 服务器上执行

### 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | bash
systemctl enable docker && systemctl start docker
```

### 2. 把项目放到服务器

```bash
cd /opt
git clone https://github.com/liceses/ds-demos-showcase.git
cd ds-demos-showcase/web
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 用 vim/nano 编辑 .env
#  - 必改：JWT_SECRET 改成随机长字符串
#  - 可选（推荐，大文件走 OSS）：填 OSS_ENDPOINT / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
```

> **OSS 桶权限**：在阿里云 OSS 控制台把 bucket 读写权限设为 **公有读 / 私有写**，这样预览/下载才能 302 直连 OSS，不占服务器 3M 带宽。上传仍用签名（私有写），安全。

### 4. 构建并启动

```bash
docker compose up -d --build
```

### 5. 验证

```bash
docker compose ps
curl http://127.0.0.1/
curl http://127.0.0.1/api/v1/tags
```

## 开放端口

- 阿里云安全组/防火墙放行 **80**
- 浏览器访问：`http://服务器公网IP/`
- 默认管理员：`admin / admin123`

## 后续

- **域名的**：把域名 A 记录指向服务器 IP，备案完成后即可用域名访问；后续可在 Nginx 里加 HTTPS（Let's Encrypt 或阿里云免费证书）。
- **接 OSS**：文件存储已抽象在 `backend/app/services/storage.py`，之后可把本地盘换成 OSS，API 不变。
- **更新部署**：
  ```bash
  cd /opt/ds-demos-showcase/web
  git pull
  docker compose up -d --build
  ```

## 端口说明

- 80：前端 Nginx（SPA + 反向代理 /api /preview /media）
- backend 不直接对外，只供 Nginx 内网代理