# 事故分析：QueuePool 连接池耗尽导致全站挂死（deepdemos.top，2026-09-01）

- 日志样本：`docs/logs/ds-demos-showcase-backend-1-20260901225426.log`（1000 行，为挂死窗口期的日志片段）
- 部署形态：Docker 容器 `ds-demos-showcase-backend-1`，`uvicorn --workers 1`，SQLite（WAL），连接池 `pool_size=20 + max_overflow=20`（总 40），`pool_timeout` 为默认 30s（**线上跑的是旧代码**）
- 结论速览：三类「借了连接不还 / 同一瞬间借太多」的代码模式叠加，把 40 个连接全部占住；`pool_timeout=30s` 又把等待放大成 268 秒的请求排队，形成只能重启自愈的雪崩。

---

## 1. 日志证据

| 证据 | 数量 / 内容 | 含义 |
|---|---|---|
| `sqlalchemy.exc.TimeoutError: QueuePool limit of size 20 overflow 20 reached, connection timed out, timeout 30.00` | 8 次（片段内） | 40 个连接全部被占满，新请求等 30 秒拿不到连接直接失败 |
| `INFO:app:GET /api/v1/auth/me -> 401 268544ms ip=120.238.233.213` | 2 条（另一条 268503ms） | 请求在队列里排了约 4.5 分钟才被处理；返回 401 说明最终拿到了连接、只是 token 无效——延迟全部耗在排队上 |
| 堆栈落点集中在 `deps.py:14 current_user` / `deps.py:27 optional_user` | — | 受害者是「每个请求都要跑的鉴权依赖」，说明全站 API 面瘫痪，而非某个单点接口 |
| 片段内无其他业务 ERROR | — | 故障期间业务请求根本拿不到连接，连报错的资格都没有 |

两个来源 IP（120.238.233.213 / 171.37.13.138）是普通移动端访客，**不是攻击**：正常流量在池子饱和后也会被拖死。

## 2. 事故机理（雪崩链路）

```
连接池 40 = anyio 线程池 40（uvicorn 默认），每个同步请求 = 占 1 线程 + 短暂占 1 连接
        │
        ▼
① 慢占用：oss-sync 后台同步跨「分钟级」OSS 网络 I/O 持有 1 个连接（每次容器重启自动触发）
② 尖峰：demo 页 N 个子资源在门禁缓存过期瞬间并发查库 → 瞬间多借 N 个连接（无 single-flight）
③ 放大：/meta/site-info 单请求嵌套借 3 个连接（自身会话 + get_stats + get_live_stats）
        │
        ▼
池子 40 打满 → 新请求在 pool.connect() 上等 30s（pool_timeout 默认值）
→ 40 个线程全变成「30 秒等待者」，后续请求在线程池队列里无限排队
→ 排队时间可达 268s（日志实测）→ 前端/访客重试进一步加压
→ 雪崩，只能重启容器自愈
```

## 3. 根因清单（按线上已提交代码 HEAD 标注）

### R1 · site-info 单请求嵌套借 3 个连接（放大器）
`backend/app/services/site_info_service.py`（HEAD 版本）：
- `:51` `_build()` 自己开 `SessionLocal()` 并跨整个聚合查询持有；
- `:124-125` 同一个请求里再调 `visits.get_stats()` + `visits.get_live_stats()`，两者各自又开独立会话。

一个 `/api/v1/meta/site-info` 请求 = 3 个连接同时被 checkout。该接口带 60s 缓存，缓存过期瞬间的首个请求就会三倍占用。

### R2 · 预览门禁缓存雪崩（尖峰源）
`backend/app/services/scope.py`（HEAD 版本）`demo_public_in_scope()`：
- TTL 仅 60s，无 single-flight；
- 一个 demo 页面并发拉 N 个 js/css/图片子资源，每个子资源请求都要过门禁——缓存过期瞬间 N 个线程**同时**开独立会话查同一行。
- 页面越热、子资源越多，尖峰越高，直接把池子打穿。

### R3 · oss-sync 跨网络 I/O 持有连接（慢占用）
`backend/app/services/oss_sync.py`（HEAD 版本）`sync_all()`：
- 会话从取 demo 清单开始一直持有到整个上传循环结束；
- 上传是分钟级 OSS 网络 I/O；`main.py:_auto_sync_oss` 在**每次容器启动**都触发一遍。
- 每次重启/重新部署后，池子自带一个「长期占用者」，把系统推向更脆弱的稳态。

### R4 · pool_timeout=30s 把饱和放大成全站挂死（放大器，非根因）
`backend/app/database.py`（HEAD 版本用默认 30s）：
- 拿不到连接时请求原地等 30s；40 个线程槽全被「等待者」占住后，连不碰数据库的排队逻辑也被拖住；
- 这解释了日志里 268s 的 `/auth/me`：它最终成功拿到连接并执行（401），说明延迟全在排队而非 DB 本身。

### 次要因素
- SQLite WAL 单写者：写并发高时 `busy_timeout=5000` 会拖慢单条写，但本事故中它只是让持有者「还连接更慢」，不是池耗尽的主因。
- `notification_service.create()` 等在请求内另开短会话（评论/回复路径）：单次嵌套时间极短，可接受，但高峰期是额外压力。

## 4. 本地修复状态盘点（未提交、未部署）

工作区已包含针对本次事故的修复（注释里直接引用「2026-09 事故」）：

| 文件 | 修复内容 | 状态 |
|---|---|---|
| `backend/app/database.py` | `pool_timeout=5`（宁可快速 500 不挂死） | ✅ 完整 |
| `backend/app/services/oss_sync.py` | 只借连接取一次 slug 清单，上传循环不再持有会话 | ✅ 完整 |
| `backend/app/services/scope.py` | 预览门禁加 per-slug single-flight + TTL 60s→300s | ✅ 完整 |
| `backend/app/services/visits.py` | `get_live_stats(db=None)` 支持复用调用方会话 | ⚠️ **不完整，见 P0** |
| `backend/app/services/site_info_service.py` | 改为把自身会话传给 visits（消除 R1 的三倍占用） | ⚠️ **依赖 P0 的修复** |

### P0 · 修复不完整：`get_stats` 签名漏改（部署阻断项）

- `backend/app/services/visits.py:121` 仍是 `def get_stats() -> dict:`（不接收参数）；
- 但 `backend/app/services/visits.py:77` 和 `backend/app/services/site_info_service.py:124` 现在都按 `get_stats(db)` 调用。

一旦以当前工作区代码构建部署，两个核心接口会**稳定 500**（`TypeError: get_stats() takes 1 positional argument but 2 were given`）：
- `GET /api/v1/stats/live`（`get_live_stats` 内部无条件调 `get_stats(db)`）
- `GET /api/v1/meta/site-info`（deep 视区缓存过期重建时）

修法（一行）：把 `get_stats` 改为 `def get_stats(db: Session | None = None) -> dict:`，`db` 为空时自开 `SessionLocal()`、传入时复用（与 `get_live_stats` 同款模式），并补一条 `/stats/live`、`/meta/site-info` 的回归测试。

## 5. 行动清单

1. **先修 P0**（`get_stats` 签名），本地跑一遍 `backend/tests`；
2. 提交全部修复并重新构建镜像部署——线上容器目前仍是 `timeout 30.00` 的旧代码，只重启不换代码还会复发；
3. 部署后重点观察：`/api/v1/meta/site-info`、`/api/v1/stats/live`、`/api/v1/health` 与日志中是否再现 `QueuePool limit`；
4. 可选加固（非本次必需）：
   - 给 site-info 响应确认 Cloudflare 边缘缓存生效（响应已带 `Cache-Control: max-age=60`），把重建频率进一步压低；
   - 监控侧对 `/health` 503 与日志关键字 `QueuePool` 加告警；
   - 若流量继续增长，SQLite + 单容器是下一个瓶颈，再考虑 Postgres / 读写分离。
