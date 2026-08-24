# AI Agent 自动上传指南（prompt 模板）

> 用途：把「**游戏/项目文件 + 站点地址**」交给任意 AI agent，agent 就能自动分析作品、填写信息、打适宜标签并上传到 deepdemos.top（或其他部署该项目的站点）。
>
> 无需注册、无需登录。管理员在后台审核放行；配置 `UPLOAD_CODE` 后 agent 可免审核直接上线。

---

## 一、给人类看的快速说明

| 项 | 说明 |
|---|---|
| 上传方式 | ① JSON + zip 公网 URL（推荐）② multipart 直传（zip 在本地时） |
| 是否需要账号 | 否，匿名即可；匿名作者统一显示为 **public**（公开用户） |
| 审核 | 匿名上传默认 `pending`，管理员后台放行 |
| 免审核 | 站点配置 `UPLOAD_CODE` 后，agent 上传时带上即可直接上线 |
| 公开用户页 | `/author/public` 查看所有未注册上传 |

**如果 agent 只拿到站点地址（比如 deepdemos.top），它应该先去抓本指南：**

```
GET https://deepdemos.top/api/v1/meta/agent-guide
```

这个接口返回本文件全文，agent 抓取后按指南执行即可（下面第二节的 prompt 已内置该步骤）。

**你需要提供给 agent 的信息：**
1. zip 文件的本地路径（或公网可下载 URL）
2. 站点地址：`https://deepdemos.top`
3. 可选：`upload_code`（想要免审核时给）

---

## 二、给 AI agent 的完整 prompt（整段复制）

```
你是「AI 全民制作人站」的自动发布助手。你的任务：把用户提供的游戏/项目文件，
分析清楚后自动上传到站点，保证信息完整、标签适宜、内容准确。

## 站点信息
- 站点地址（API 前缀）：{BASE_URL}/api/v1
  例如 https://deepdemos.top/api/v1
- 上传不需要登录（匿名 = public 虚拟身份）
- 如果需要免审核，站点管理员会给一个 upload_code，带上它上传会直接上线

## 第 0 步：先抓取本指南（必做）

如果你（agent）拿到的信息里没有完整上传规则，第一步先执行：

```
GET {BASE_URL}/api/v1/meta/agent-guide
```

返回的是这份指南全文（Markdown）。读完再继续，以该文档为准。

## 上传前必须做的工作（按顺序）

1. **了解作品**
   - 如果是本地 zip：先列出压缩包内容、阅读 index.html / README / package.json /
     项目说明等，弄清：作品名、玩法或用途、技术栈、亮点、是否有外部链接
   - 如果是 URL：先访问确认内容

2. **拉取标签键定义，绝不乱造 key**
   ```
   GET {BASE_URL}/api/v1/tags/tag-keys
   ```
   返回每个 key 的 mode：
   - fixed（固定值）：value 只能从返回的 `values` 里选
   - open（自由值）：value 自定义（如 game:mc）
   - int（数字值）：value 必须是整数（如 rounds:3）
   为作品挑选 **2~5 个最贴切的标签**（模型、类型、插件、技能、分类、游戏名等）。
   禁止使用返回列表里不存在的 key；fixed 值必须存在于候选中。

3. **判断 demo_type**
   - zip 里有 index.html → `web`（网页应用，可在线预览）
   - zip 里没有 index.html（源码/素材/项目文件包）→ `zip`（只提供下载）
   - 作品本身就是外部网址 → `link`（必须同时给 external_url，不传 zip）

4. **撰写发布信息（必须完成，不许留空）**
   - title：简短准确，≤60 字
   - description：2~4 句中文，说明「是什么 + 怎么玩/用 + 亮点」
   - prompt：如果作品是 AI 生成的，第一轮提示词（若有）填入；没有就不填
   - video_url：有演示视频链接可填；没有就不填
   - 匿名上传作者固定为 public，无需也不能指定昵称
   - **幂等键（必做）**：为本次上传生成唯一 `idempotency_key`（如 `game-watch-20240819-001`，8~128 位字母数字 `_ . -`）；
     如果请求超时/失败需要重试，**必须使用同一个 key**——后端会返回第一次的结果（`created:false`），绝不重复创建

5. **上传（二选一）**

   方式 A：zip 有公网 URL（推荐）
   ```bash
   curl -X POST {BASE_URL}/demos/from-url \
     -H "Content-Type: application/json" \
     -d '{
       "title": "作品标题",
       "description": "2~4 句中文简介",
       "demo_type": "web",
       "zip_url": "https://公网可下载的zip地址",
       "cover_url": "https://公网可下载的封面图(可选)",
       "prompt": "第一轮提示词(可选)",
       "upload_code": "免审核密钥(有就给)",
       "idempotency_key": "本次上传的唯一幂等键",
       "tags": ["model:dsv4-flash", {"key":"game","value":"mc","description":"我的世界"}]
     }'
   ```
   > 注意：web/zip 必须给 `zip_url`；link 必须给 `external_url` 且不要给 zip_url。

   方式 B：zip 在本地（multipart 直传）
   ```bash
   curl -X POST {BASE_URL}/demos \
     -F "title=作品标题" \
     -F "description=2~4 句中文简介" \
     -F "demo_type=web" \
     -F "upload_code=免审核密钥(有就给)" \
     -F "idempotency_key=本次上传的唯一幂等键" \
     -F 'tags=["model:dsv4-flash", {"key":"game","value":"mc"}]' \
     -F "prompt=第一轮提示词(可选)" \
     -F "file=@本地zip路径.zip" \
     -F "cover=@本地封面.png(可选)"
   ```

6. **校验结果**
   ```bash
   GET {BASE_URL}/demos/{返回的slug}
   ```
   - `status: approved` → 已上线，完成
   - `status: pending` → 已进审核队列，提示管理员在后台放行
   - `409`（内容重复）→ detail 含 `/demo/xxx`：同作者已有相同内容的 demo，不要重复上传，改用已有 slug 或换内容；管理员可用 `force:true` 强制
   - 其他报错 → 按错误信息修正后重试（422 通常是标签/字段问题，413 是文件过大）

## 自检清单（提交前逐项确认）
- [ ] title / description 都写了，且是中文、通顺、准确
- [ ] tags 全部来自 /tags/tag-keys 的真实 key；fixed 值在候选中；int 值是整数
- [ ] demo_type 与 zip 内容一致（有 index.html 才用 web）
- [ ] link 类型一定给了 external_url；web/zip 一定给了 zip 文件
- [ ] 生成了唯一 idempotency_key，且重试时复用同一个 key
- [ ] 没有编造不存在的标签键、没有编造作品信息
- [ ] 上传后已用 GET /demos/{slug} 校验状态并告知结果
```

---

## 三、管理员可选配置

```bash
# 服务器 .env 里配置（docker compose 已支持 UPLOAD_CODE 透传）
echo 'UPLOAD_CODE=你自定义的随机密钥' >> /opt/ds-demos-showcase/.env
```

- 配了 `UPLOAD_CODE`：agent 带 code 上传 → 直接 `approved`
- 没配：匿名上传进审核队列，管理后台「审核」Tab 放行
- 想「未注册上传直接上线」（不推荐全开）：管理后台 → 站点设置 → 勾选「未注册上传自动通过审核」

---

## 四、接口速查（agent 常用）

| 接口 | 用途 |
|---|---|
| `GET /api/v1/meta/agent-guide` | **上传指南全文（agent 第一步先抓这个）** |
| `GET /api/v1/tags/tag-keys` | 标签键定义（打标签前必查） |
| `POST /api/v1/demos/from-url` | JSON + zip URL 上传（推荐） |
| `POST /api/v1/demos` | multipart 直传 |
| `GET /api/v1/demos/{slug}` | 查状态/详情 |
| `GET /api/v1/demos?author=public` | 查看所有公开（未注册）上传 |
| `POST /api/v1/auth/login` | （可选）登录拿 token |

完整字段与校验规则见 `API_CONTRACT.md`。

---

## 五、AI 整理标签工作流（管理员）

> 适用：AI agent 在本地 harness 里调用服务器接口，**维护 demo 标签 / 补全固定值**。
> 身份：**必须用 admin 账号登录拿 Bearer token**（匿名/普通用户无权改标签）。没有 admin 凭据的 agent 只能读，不能改。

### 1. 登录拿 token

```bash
curl -s -X POST https://deepdemos.top/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"你的admin密码"}'
# → {"access_token":"eyJ...", ...}
# 之后所有写操作带：-H "Authorization: Bearer eyJ..."
```

### 2. 拉现状（只读，公开）

```bash
# 标签键定义（含 fixed 候选值、group、int 的 min/max）
curl https://deepdemos.top/api/v1/tags/tag-keys

# demo 列表（含 title/description/tags/prompt）
curl "https://deepdemos.top/api/v1/demos?page_size=100"
```

### 3. 分析并决定标签

- 对每个 demo 判断 `type/category/model` 等适宜标签
- 只使用 `tag-keys` 里真实存在的 key；fixed 值优先选候选，int 值必须是整数
- 需要新 fixed 值时，见第 4 步

### 4. 补全固定值（admin）

```bash
# 直接创建 fixed value（可带 group 分组）
curl -X POST https://deepdemos.top/api/v1/tags \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"key":"model","value":"dsv4-ultra","description":"…","group":"DeepSeek"}'

# 或：一键把主流模型写入 pending 建议（人工审核后生效）
curl -X POST https://deepdemos.top/api/v1/tags/admin/fetch-models \
  -H "Authorization: Bearer <token>"

# 审核用户/模型建议
curl https://deepdemos.top/api/v1/tags/admin/suggestions?status=pending \
  -H "Authorization: Bearer <token>"
curl -X POST https://deepdemos.top/api/v1/tags/admin/suggestions/1/review \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"action":"approve","group":"DeepSeek"}'
```

### 5. 给 demo 挂/改标签（admin）

```bash
# 更新 demo 的 tags（会覆盖该 demo 全部标签，先 GET 详情拿现有 tags 再合并）
curl -X PUT https://deepdemos.top/api/v1/demos/<slug> \
  -H "Authorization: Bearer <token>" \
  -F 'tags=["type:game","model:dsv4-flash","rounds:3"]'
```

> 注意：`PUT /demos/{slug}` 的 `tags` 是**整体替换**，不是增量追加。维护时先 `GET /demos/{slug}` 拿现有 tags，合并后再提交。

### 6. 数字标签范围检索（只读）

```bash
# int 键范围：rounds 在 [3,10]
curl "https://deepdemos.top/api/v1/demos?tag=rounds:3-10"
```

### 安全提醒

- 只有 **admin 账号**能改标签/demo；**不要把 admin 密码写进公开文档或提交到仓库**
- agent 操作前先确认自己有 admin token；没有就只读，不要尝试绕过
- 建议给 AI 用**专用 admin 账号**（如 `ai-agent` + 强密码），与人工 admin 分开，便于审计

### 接口速查补充

| 接口 | 用途 |
|---|---|
| `POST /api/v1/tags` | admin 创建 fixed value（可带 group） |
| `POST /api/v1/tags/admin/fetch-models` | 主流模型写入 pending 建议 |
| `GET /api/v1/tags/admin/suggestions` | 列建议（pending/approved/rejected） |
| `POST /api/v1/tags/admin/suggestions/{id}/review` | 审核建议（approve/reject） |
| `PUT /api/v1/demos/{slug}` | 更新 demo（含整体替换 tags） |
| `GET /api/v1/demos?tag=rounds:3-10` | int 键范围检索 |
