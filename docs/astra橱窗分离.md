# astra 橱窗分离（astrademos.top 独立视区）

> 目标：deepdemos.top 保持全功能主站；astrademos.top 面向海外，是「astra canary 灰测作品收集」
> **极简只读橱窗**——只展示策展过的纯英文 demo，无论坛/评论/登录/上传。
> 两个域名共用同一套后端与数据，靠 **Host → 视区（scope）** 在数据出口分流；deepdemos 行为逐字节不变。

## 一、概念模型

```
浏览器 → Cloudflare → nginx（两个 server_name 同一 upstream）
                         │ Host 命中 ASTRA_HOSTS？
┌────────────────────────┴───────────────────────┐
│ 后端 middleware（app/main.py site_scope）        │
│  deep  视区：全部路由照常（现网行为零变化）        │
│  astra 视区：API 白名单制——非白名单一律 404       │
│    ✓ GET /api/v1/demos?…      只出 sites~astra  │
│    ✓ GET /api/v1/demos/{slug} 池外 = 不存在      │
│    ✓ GET /api/v1/demos/{slug}/download          │
│    ✓ GET /api/v1/meta/site-info  （分域聚合）    │
│    ✓ GET /api/v1/health                         │
│    ✓ GET /preview/*  /media/（slug 门禁见下）    │
│    ✗ 论坛/评论/auth/上传/管理/docs/stats/tags…   │
└────────────────────────────────────────────────┘
```

单一实现文件：`backend/app/services/scope.py`（判定、过滤条件、白名单、预览门禁缓存）。
视区经 `request.state.scope` + `current_scope` contextvar 传播，serializer 等非路由调用点同样可读。

## 二、数据层（demos 表两个新列，增量迁移无感）

| 列 | 默认 | 含义 |
|---|---|---|
| `sites` | `'deep'` | 逗号枚举 deep / astra / deep,astra —— 站点通行证。**存量 584 行全部默认 'deep'，主站零影响** |
| `lang` | `'zh'` | 作品语言 zh / en —— 策展约定：上 astra 橱窗的作品应为 en（后端不强制，管理面把关） |

**白名单制而非黑名单**：astra 视区只放行上表路径，未来新增任何路由默认对橱窗不可见，防止漏堵。
`/api/v1/demos/` 前缀放行后再按段剔除 `/related`、`/session-logs`、`/meta`（橱窗不消费且会漏内容面信息）。

## 三、astra 视区的输出层差异（只改响应形态，不碰存储数据）

| 出口 | deep | astra |
|---|---|---|
| demo 列表/详情/随机/related | 全量 | 仅 `sites` 含 astra（池外 slug 一律 404，错误文案与不存在一致，不泄露存在性） |
| 序列化 `author` | 真实作者 | 恒为 `"astra lab"`；过滤 `author:` / `version-of:` 内部标签 |
| `preview_url` | `PREVIEW_BASE_URL`（demo.deepdemos.top） | `ASTRA_PREVIEW_BASE_URL`；留空则同源相对 `/preview/…` |
| `/preview/{slug}/…` | 现状 | 只出策展池且已上架（60s 缓存护子资源逐文件打库；策展接口即时失效缓存） |
| `/media/` 封面 | 现状 | 不逐文件反查归属（封面路径为哈希名不可枚举，风险可接受） |
| site-info | 现状 | 分域键缓存：社区/论坛/流量归零、`fun_mode` 恒真、不广播上传通道、站点名 astra 口径 |
| 标签原始值 | 原样 | **原样**（`model:ds-unknown` 等仍是数据，前端 funMode 负责翻译成 astra-canary——复制/URL/载荷恒原值的铁律不变） |

## 四、策展操作

```bash
# 发放通行证（deep 域管理端执行）
PUT /api/v1/admin/demos/{slug}/curation
{ "sites": ["astra"], "lang": "en" }      # 字段 None = 不动；sites 需 deep/astra 非空子集
# 回读：GET /api/v1/admin/demos?sites=astra（策展过滤）；行内含 sites/lang（仅 AdminDemoOut 暴露，公开 schema 自动剥离）
```

- 纯 astra（sites='astra'）= 从主站**也**消失（详情/列表/预览全门禁）——「橱窗独占作品」的正确姿势。
- 双栖（'deep,astra'）= 两站同时可见，用于想引流的精品。
- 管理后台 UI（AdminDemosSection 勾选框）为后续批次。

## 五、部署清单（astra 域名启用时）

**默认方案：零新增基建**——预览走 astra 域自身同源 `/preview`（线上实测主域 `/preview` 与子域同内容皆 200）。
`demo.deepdemos.top` 子域只提供"跨域隔离 + demo localStorage"增值，**不是橱窗的依赖**；
deepdemos 侧若想彻底弃用它，只需清空 `PREVIEW_BASE_URL`（`IframePreview.vue` 检测到同源会自动不放行 `allow-same-origin`，沙箱反而更严一档）。

1. **DNS/CF**：`astrademos.top` A 记录接入同一 Cloudflare/服务器（不需要任何子域）。
2. **nginx**（`frontend/nginx.conf` 加 server 块）：`server_name astrademos.top;` 与主站块同构——SPA 回退 + `/api|/preview|/media` 反代 backend:8000。
3. **`.env`**：`ASTRA_HOSTS=astrademos.top`（代码默认已含，留空可彻底关闭视区）；`ASTRA_PREVIEW_BASE_URL` 留空即可。
4. **CORS**：同源方案下**无需任何 CORS 变更**（当前 `OSS_SERVE_LOCAL=true`，预览/封面源站 200 直出）。仅当将来启用 OSS 直连（`=false`）时，OSS 桶 CORS 来源需追加 `https://astrademos.top`——http/https 都要加的教训见《预览架构与排坑记录》。
5. **可选增值**：策展作品若需 localStorage 运行（存档类游戏等），再加 `demo.astrademos.top` 子域 + `ASTRA_PREVIEW_BASE_URL=https://demo.astrademos.top`（nginx 只放行 `/preview`、`/media`，照抄主站预览块）；前端 sandbox 逻辑对跨域自动放行 `allow-same-origin`，零代码改动。
6. **robots**：astra 域 `robots.txt` Disallow 全部（橱窗不做 SEO，防止 Google 把策展池当主站镜像/顺藤摸瓜）。
7. **Cloudflare 缓存**：默认按 hostname 分缓存键，两域不会串味；橱窗前端建议 `no-cache` 文档 + 页面资源走 assets 长缓存规则。

## 六、与整活模式（fun mode）的关系

- 旧整活 = deepdemos 上的显示层开关（设置表驱动，`?fun=1` 预览）——保留不动。
- 新橱窗 = **域名驱动**：astra 域数据面物理隔离 + 前端强制 fun/EN（前端批次接入），不依赖 settings 开关。

## 七、已知边界与后手

- 两域共库：astra 的 view_count 混入主站计数（榜单口径目前不敏感，需要时分域计数再加列）。
- `/media` 封面不逐文件鉴权（哈希名不可枚举；若被扒链会连带暴露预览路径，可接受）。
- astra 匿名上传被白名单直接挡死；将来若收海外投稿，走 deepdemos 审核 + 人工策展进橱窗。
- 拆站逃生门：若整活要出圈，用 `sites~astra` 导出子集独立部署即可——本设计已把内容池边界画好。

## 八、测试

`backend/tests/test_scope.py` 7 例：deep 默认不变 / 策展跨域搬迁 / 双栖 / 白名单 404 / 预览双向门禁 / site-info 分域 / random 分键。
`TestClient(app, base_url="http://astrademos.top")` 即模拟橱窗域，无需 hosts 改配。
