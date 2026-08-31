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
- 管理后台 UI 已接入：「作品管理」新增 **橱窗列**（`主`/`窗` 两枚通行证章 + 语言下拉，乐观更新失败回滚）与 **橱窗池** 筛选 tab（`AdminDemosSection.vue`）。

## 四·五、橱窗前端（B2 已完成）

同一份构建、运行时按 hostname 分叉（`frontend/src/main.ts`）：
- `frontend/src/astra/scope.ts`：命中 astrademos.top → 加载 `main-astra.ts` 独立 mini-SPA（三页 + 极简壳），**主站 App/router/style.css 物理不加载**；其余域名走主站原路径，逐字节不变。
- 三页：`AstraWorksView`（hero + 灰测叙事条 + 均匀网格画廊）、`AstraWorkView`（大预览 + operator brief = prompt 的橱窗化名；无评论/日志/时间线）、`AstraAboutView`（假 model card + request access）。
- 视觉：`astra/astra.css` 实验室极简（白底 hairline 等宽，与主站新野兽派零交叉），astra chunk 总负载 ~14KB。
- 橱窗内 funMode 强制开、语言锁 EN、作者落款 "astra lab"（后端输出层）；ds-unknown→astra-canary 翻译复用 `tagLabel`。
- `AstraAboutView.REQUEST_URL` 上线前换成真实接收入口（Discord/X/mailto）。
- 本地预览：hosts 加 `127.0.0.1 astrademos.top` → `./start-dev.ps1` → `http://astrademos.top:5173`（vite proxy 已改 `changeOrigin:false` 透传 Host，主站端口 localhost:5173 不受影响）。

## 五、部署清单（astra 域名启用时）

**默认方案：零新增基建**——预览走 astra 域自身同源 `/preview`（线上实测主域 `/preview` 与子域同内容皆 200）。
`demo.deepdemos.top` 子域只提供"跨域隔离 + demo localStorage"增值，**不是橱窗的依赖**；
deepdemos 侧若想彻底弃用它，只需清空 `PREVIEW_BASE_URL`（`IframePreview.vue` 检测到同源会自动不放行 `allow-same-origin`，沙箱反而更严一档）。

1. **DNS/CF**：`astrademos.top`（可含 www）A 记录接入同一 Cloudflare/服务器（不需要任何子域）。
2. **nginx**：`frontend/nginx.conf` **已含** `server_name astrademos.top www.astrademos.top` 块——SPA 回退 + `/api|/preview|/media` 同源反代（Host 原样透传，后端据此判定视区）+ 内置 robots 全 Disallow + `X-Robots-Tag: noindex`。部署侧无新增工作。
3. **`.env`**：`ASTRA_HOSTS=astrademos.top`（代码默认已含，留空可彻底关闭视区）；`ASTRA_PREVIEW_BASE_URL` 留空即可。
4. **CORS**：同源方案下**无需任何 CORS 变更**（当前 `OSS_SERVE_LOCAL=true`，预览/封面源站 200 直出）。仅当将来启用 OSS 直连（`=false`）时，OSS 桶 CORS 来源需追加 `https://astrademos.top`——http/https 都要加的教训见《预览架构与排坑记录》。
5. **可选增值**：策展作品若需 localStorage 运行（存档类游戏等），再加 `demo.astrademos.top` 子域 + `ASTRA_PREVIEW_BASE_URL=https://demo.astrademos.top`（nginx 只放行 `/preview`、`/media`，照抄 demo.deepdemos.top 块）；前端 sandbox 逻辑对跨域自动放行 `allow-same-origin`，零代码改动。
6. **Cloudflare 缓存**：默认按 hostname 分缓存键，两域不会串味；橱窗文档建议 Cache Rule no-cache，`/assets/*` 走长缓存（构建带 hash）。

## 五·五、本地预览手册（开发环境实测流程）

**五分钟从零看到橱窗**：

```powershell
# 1) 域名映射（管理员 PowerShell，一次性；Windows 的 hosts 无通配 localhost，必须显式加）
Add-Content C:\Windows\System32\drivers\etc\hosts "`n127.0.0.1 astrademos.top"

# 2) 起服务（后端 :8000 uvicorn --reload、前端 :5173 vite）
./start-dev.ps1

# 3) 策展（关键：必须走 deep 域——橱窗域管理端点被白名单 404，这是设计而非 bug）
#    浏览器 http://localhost:5173 → /admin → 作品管理 → 给作品点「窗」章 + 标 EN
#    或命令行：
#    curl -X PUT http://127.0.0.1:8000/api/v1/admin/demos/{slug}/curation -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"sites":["astra"],"lang":"en"}'

# 4) 打开橱窗
#    http://astrademos.top:5173
```

链路要点（缺一本地就跑不通）：
- **vite `allowedHosts`**：Vite 6+ 对非 localhost 的 Host 头直接 403（dev server 安全策略），`vite.config.ts` 已放行 `astrademos.top`；升级 vite 后失效先查这里。
- **vite proxy `changeOrigin:false`**：把浏览器 Host 原样透传给后端，后端 `resolve_scope` 才能判出 astra 视区（端口会被自动剥掉）。改回 `true` 会恒以 `localhost:8000` 为 Host → 永远 deep。
- 策展与浏览分离：橱窗域连 `/docs`、`/api/v1/auth/login` 都 404，admin 无法在橱窗里误操作自己——管理永远回 localhost/deepdemos 域。

**皮肤预览降级方案（不想动 hosts）**：`http://localhost:5173/?astra=1`（仅 DEV 构建生效，`?astra=0` 关）。只切前端皮，API 的 Host 还是 localhost → **数据面仍是主站全量**，看不了隔离效果——快速对视觉有用，验证门禁必须走真域名。

**端到端手测一行脚本**（绕开 hosts，直打后端换 Host 头，适合 CI 外的冒烟）：

```bash
# astra 域：/docs 应 404、/api/v1/demos 只回策展池、site-info fun_mode=true
curl --resolve astrademos.top:8000:127.0.0.1 -s http://astrademos.top:8000/api/v1/meta/site-info | jq .display
```

> ⚠️ Node `fetch()` **改不了 Host 头**（fetch 规范 forbidden header，静默忽略）——脚本冒烟用 `node:http` 裸请求或 curl，别用 fetch 自带 headers.Host，会得到「门禁失效」的假象（本手册作者踩过并已写进测试：pytest 用 `TestClient(app, base_url="http://astrademos.top")`，httpx 会真实下发 Host 头，无此坑）。

## 六、与整活模式（fun mode）的关系

- 旧整活 = deepdemos 上的显示层开关（设置表驱动，`?fun=1` 预览）——保留不动。
- 新橱窗 = **域名驱动**：astra 域数据面物理隔离 + 前端强制 fun/EN（见 §四·五），不依赖 settings 开关；橱窗 origin 的 localStorage 与主站天然隔离，fun 互不串台。

## 七、已知边界与后手

- 两域共库：astra 的 view_count 混入主站计数（榜单口径目前不敏感，需要时分域计数再加列）。
- `/media` 封面不逐文件鉴权（哈希名不可枚举；若被扒链会连带暴露预览路径，可接受）。
- astra 匿名上传被白名单直接挡死；将来若收海外投稿，走 deepdemos 审核 + 人工策展进橱窗。
- 拆站逃生门：若整活要出圈，用 `sites~astra` 导出子集独立部署即可——本设计已把内容池边界画好。

## 八、测试

`backend/tests/test_scope.py` 7 例：deep 默认不变 / 策展跨域搬迁 / 双栖 / 白名单 404 / 预览双向门禁 / site-info 分域 / random 分键。
`TestClient(app, base_url="http://astrademos.top")` 即模拟橱窗域，无需 hosts 改配。
