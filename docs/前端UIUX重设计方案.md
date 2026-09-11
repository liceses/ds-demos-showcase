# 前端 UI/UX 重设计方案（V1 · 待批）

> 依据：三份只读审计（CSS 架构 / 功能缺口 / 布局·IA）+ 22 页 CDP 实测（1440/1280/1024/390 四档）
> 实测产物：`.tmp-cdp-profile/shots/*.png`（21 张整页截图）、`.tmp-cdp-profile/measure.json`（逐元素几何）
> 原则：**视觉语言不动，布局与信息架构重做，功能缺口补齐**

---

## 0. 方向裁决（需要你点头的三条）

| # | 议题 | 我的主张 | 理由（证据） |
|---|---|---|---|
| D1 | 视觉语言（新野兽派：4px 纯黑边框/硬偏移影/零圆角/高饱和） | **保留** | 令牌层（primitives→semantic→themes 四层）职责清晰、`!important` 全库仅 5 处且全部合理、`tokens/` 外令牌重声明仅 1 处。换语言=丢掉这套资产，收益只有"看起来新" |
| D2 | `.huge` 巨字档（`clamp(44px,8vw,120px)`，1440 屏实测 **115.2px**） | **分档**：品牌页（首页 hero）保留；功能页（登录/注册/404/上传/标签/模型详情/关于）降到 42px 档 | 登录页 115px 标题 + 440px 表单卡；标签详情把内部标识渲染成 115px 的 `model:ds-unknown`（`TagDetailView.vue:69`）；模型详情 115px 的 slug。这不是风格，是把内部标识端给用户 |
| D3 | 页宽契约：全站只有一条 `min(1280px, 100% - 32px)`（`styles/layouts/container.css:2-3`），任何"窄列"都由页内容器各写各的（440/640/720/760/860/1180…） | **引入三档宽度令牌**（见 §1.3） | 现状证据：关于页正文卡内联 `max-width:640px`（`AboutView.vue:149,162`）在 1280 容器里只用半屏；粉丝名单 `720px`（`user-follow.css:6`）右侧空 560px；上传表单 `760px`（`tag-system.css:435`）而二栏 grid 是**死规则**（`:245-253` 被同文件 `:431-432` 的 `display:block` 废止）→ 实际占 704px，1280 里闲置 ~520px |

### 0.1 实测验证状态（我对审计的 H 级结论逐条上机复核）

审计是静态读取，H 级缺陷靠 z-index/盒模型推导。我用 CDP 在真实浏览器里复测，**结论有修正**：

| 审计结论 | 复测方法 | 结果 |
|---|---|---|
| DemoView 移动 5 键动作条被 TabBar 整条压住 | 390px 下取两者 rect + `elementFromPoint` | ✅ **成立**：两者 `top:786 / bottom:844 / h:58` **完全重合**；动作条中心的 `elementFromPoint` = `SPAN.fab-glyph`（底栏 FAB 在上）；垫底 `body 60px + app-shell 56px = 116px` 死空白 |
| DemosView 移动筛选 sheet 底部 56px 被压 | 点开 sheet 后测 | ✅ **成立**：sheet `bottom:844`，在其内 824px 处 `elementFromPoint` = `A.fab` |
| TagListView `180px 1fr` 无 ≤480 媒体查询 | 480px 下读 computed | ✅ **成立**：`grid-template-columns = 180px 237px`（值面板仅 237px） |
| UploadView 二栏是死规则 | 1440px 下读 computed | ✅ **成立**：`display:block`，`grid-template-columns: minmax(0,1fr) 400px` 仍在但无效 |
| 论坛 `860px` 是全区间死值 | 1440px 下读 computed | ✅ **成立**：`.forum-container` computed `max-width:1280px` |
| TaskDetailView `table-layout:fixed` 必然溢出 | 真实数据（`tetris-web`）1440/390 逐格测 | ❌ **未复现**：溢出单元格 **0** 个，wrap 无横溢（1440 表 1272、390 表 354）。**降级为"长内容下的风险"**，不作为已确认缺陷 |
| AboutView 正文卡 640px（半屏） | 1440px 下遍历测 | ✅ **成立**：4 张卡实测 **640px**，容器 1280 |
| SettingsView 同页两个宽度 | 登录后 1440px 测 | ✅ **成立**：`auth-card` **440px**(left 493) 与 `appearance-card` **1280px**(left 73)，右缘差 **840px** |
| admin `ad-main 1180px` 死值 | 登录后 1440px 测 | ✅ **成立**：shell 栅格 `210px 1050px`，`.ad-main` 实宽 **1050** → `max-width:1180px` 永不生效 |
| 登录页"巨字 + 小卡" | 1440px 测 | ✅ **成立**：h1 **115.2px**、hero 227px、卡 **440px**（容器 1280） |
| 移动首页 hero 独占首屏 | 390px 测 | ✅ **成立**：hero **808px** / 视口 844，内含 `hub-hero` 683px，正文起点 **971px** |
| `.huge = clamp(44px,8vw,120px)` | 读 CSS 实测字号 | ✅ `utilities.css:29-35`；1440 屏 = **115.2px** |
| 标签详情把 `model:ds-unknown` 当 115px 标题 | 读模板 | ✅ `TagDetailView.vue:69` |

**仍未实测（静态证据，进 P3 前再验）**：`.fl-list 720px`（`user-follow.css:6`，本库该用户无粉丝 → 空态无元素）、`.notif-*` 的 ≤720 缺失（本库无通知数据）、转场期 fixed 包含块变化。

---

## 1. 骨架层（Phase 0：**先做，且不改观感**）

### 1.1 令牌补齐（给"统一调整"造抓手）

| 缺什么 | 现状硬数字 | 补什么 |
|---|---|---|
| 间距 | 790 条 `padding/margin/gap` **100% 裸 px**，0 条用 `var()`；30 个不同值（8px×166 / 10px×149 / 12px×126 / 6px×110 / 14px×94…） | `--space-1..8`（2/4/6/8/10/12/16/24），把高频 6 值先机械替换，**视觉零变化** |
| 字号 | 24 个裸字面值（11px×86、12px×70、13px×50、10px×26、14px×24…），`html/body` 未设 font-size | `--fs-xs/sm/base/lg/xl/2xl/display`，同上机械替换 |
| z-index | 20 个离散值、无层级 | `--z-base/dropdown/sticky/drawer/tabbar/sheet/modal/toast/fullscreen`。**已知倒挂**：`toast 1100` < `论坛接管 2000` < `网页全屏 9999`；`TabBar 900` > `动作条 60`、`筛选 sheet 46`、`peek 抽屉 80` |
| 底栏高度 | 56px 硬编码在 `AppTabBar.vue:71-75`（`z-index:900`），页内 fixed 条各自 `bottom:0` | `--tabbar-h: 56px` + **底栏占位契约**（§1.2） |
| 断点 | 无令牌（媒体查询不能用 `var()`），10 个不同宽度值 | 只做**值收敛**（§1.2），不引入令牌 |

### 1.2 断点收敛与底栏契约

**断点收三档**：`480 / 720 / 1024`
- 现有 `719`（`HomeView.vue:776`、`SettingsView.vue`）+ `720`×14 + `720.02`（`DemosView.vue:971`、`NotFoundView.vue`）→ 统一 `max-width:720px` / `min-width:721px`（消除 719–720.02 的缝隙档）
- 现有 `1023`（`HomeView.vue:1025`）+ `1024`×3 + `1025`（`forum-lite.css:10`）→ 统一 `max-width:1024px` / `min-width:1025px`
- `640`（`models-tasks.css:229`）、`900`（`AdminEntitiesSection.vue:371`）、`1280`（`tag-system.css:281`）按语义并入对应档或就地收编

**底栏占位契约（这是当前最严重的可用性缺陷）**：

| 缺陷 | 证据 | 后果 |
|---|---|---|
| 作品详情移动动作条被 TabBar 整条压住 | `DemoView.vue:919-923`（`z-index:60`、`bottom:0`、56px 高） vs `AppTabBar.vue:71-75`（`z-index:900`、`bottom:0`、56px） | 5 个主操作**完全不可见**；且叠了两份垫底（`DemoView.vue:128` + `App.vue:283-285` = 116px 死空白） |
| 作品库移动筛选 sheet 底部 56px 被压住 | `DemosView.vue:783-793`（`bottom:0`、`z-index:46`，只垫 `env(safe-area-inset-bottom)`） | 最后一个筛选项点不到 |
| peek 抽屉遮罩盖不住底栏、面板被切 56px | `peek-drawer.css:2,4-9`（`z-index:80`、`height:100%`） | 抽屉底部内容被切 |

**改法**：`--tabbar-h` 入令牌；`<720` 时页内所有 `position:fixed;bottom:0` 的条改为 `bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom))`；z 序按 §1.1 的层级表重排；`<720` 下 `z(tabbar) < z(sheet/抽屉)`（sheet 与抽屉本就该盖住底栏）。

### 1.3 页宽三档（D3 落地）

| 档 | 值 | 用于 |
|---|---|---|
| `--w-page` | `min(1280px, 100% - 32px)` | 默认：作品库/探索/模型/题目/排行榜/论坛/详情页 |
| `--w-read` | `min(760px, 100% - 32px)` | 阅读与表单：关于正文、登录/注册/设置、上传向导列 |
| `--w-wide` | `min(1440px, 100% - 32px)` | 大屏列表/表格：作品库、后台主区、排行榜（≥1440 才起效） |

例外就地收编：`fl-list 720px`、`about 640px`、`auth-card 440px`、`ad-main 1180px`（**死值**：可用宽 1050px 内永不生效）、`peek 抽屉 340/360/380/400` 四值归一到 380。

### 1.4 清死（零风险，先做）

| 对象 | 证据 | 处置 |
|---|---|---|
| `components/announcement.css` (465B)、`components/comments.css` (690B)、`pages/home-lobby.css` (1977B)、`pages/sample-cred.css` (991B) | 993 个类令牌中 4 个文件**全部 0 命中**（91 个 .vue/.ts 反查） | 删文件 + 删 `index.css` 对应 `@import` |
| `_mobile-responsive.css:59-69,77-81` 的 ≤480 规则 | 覆盖的 `.entry-grid/.entry-card/.tag-strip-chips` 零引用 | 随死文件一并删 |
| `tag-system.css:245-253` 的 `.upload-grid` 二栏 grid | 被同文件 `:431-432` `display:block` 废止 | **删死规则**，保留单列（不恢复二栏——上传向导用单列是对的，只是宽度要收） |
| `forum.css:18,26,68,85` 的 `860px` | >1025 被 `forum-lite.css:10-15`(1280) 覆盖、≤1024 被 `skeleton-extended.css:335-341`(100%) 覆盖 → 全区间死值 | 删死值；论坛认下 `--w-page` |
| `admin-shell.css:63` `max-width:1180px` | 在 `1280-210-20=1050px` 可用宽内永不生效 | 删 |
| `version-timeline.css`（73% 令牌无命中）、`status-pill.css`(2/7)、`toast.css`(5/12)、`responsive-v1.css`(9/19) | 部分死（`<Transition name>` 生成的运行时类属**假死**，须逐条甄别） | 逐条甄别后删，不一刀切 |

### 1.5 拆分 `_mobile-responsive.css` 的劫持（Phase 0 收尾，风险最高）

它是 `index.css:80`（导入序 **#72，最后**），媒体查询零特异性加成 → 在 `(max-width:720px)` 内**必胜**所有同选择器的所有者文件。它改写了 `.topbar`/`.toolbar`/`.tabs`/`.table-wrap`/`.view-bar`/`.rating-card`/`.dash-stats`/`.stat-card`，并回头影响 `tokens/primitives.css` 的 `@720` 变量减半。

53 个同特异性跨文件覆盖里，绝大多数因它而生。**改法**：把每条 720px 覆盖搬回其所有者文件（`.toolbar` 规则进 `toolbar.css`，`.tabs` 进 `tabs.css`…），`_mobile-responsive.css` 只留页面级移动规则。

> **为什么这一步必须在页布局改造之前**：不拆，任何页宽/栅格改动都会在 720px 被这个链尾文件静默改写。

---

## 2. 逐页布局设计

### 2.1 严重（H：坏掉或不可用）

| 页面 | 现状（实测） | 目标 |
|---|---|---|
| DemoView | 移动动作条不可见（§1.2）；`dv-shell 876+380`，≤1024 槽落流（`demo-detail.css:309`） | 动作条浮于底栏之上；桌面保持 876+380；事实卡 ≤1024 折进主列并**分区折叠**（现 `dv-disclose-grid` 实测 3 轨、第 3 轨 0 宽） |
| DemosView | 移动 sheet 被压（§1.2）；`facet-body` 实测**单列满宽 1280**（筛选在抽屉里，桌面无常驻筛选栏） | sheet 上移；桌面 ≥1280 改 `1fr + 340px` 常驻筛选栏（栅格已存在 `DemosView.vue:747`，只需在更大断点启用） |
| TagListView | `tag-pane 180px 1fr` 硬栅格，**该文件无对应媒体查询** → ≤480 值面板仅 ~151px；`tag-pane-tall` 两侧各一个滚动区（`tag-system.css:509,546-550,322-323`） | ≤720 改单列（键选择器横向 chips，值面板全宽）；只保留一个滚动容器 |
| TaskDetailView | `table-layout:fixed` + 百分比列（13%≈45px）+ `.chain-gen{white-space:nowrap}`（`task-detail.css:24-29,66`）——**但真实数据下未复现溢出**（见 §0.1） | 保持 auto 化改造，但按 M 级做：`table-layout:auto` + `min-width` 触发真横滚；长题面/长模型名时才溢出，属预防性 |
| UploadView | 二栏是死规则，实际单列 704px（§1.4）；三步条 `uw-steps 4×170` | 保留单列，宽度改 `--w-read`(760)；步骤条改为**跨满列宽**的分段指示器 |
| 论坛三页 | `860px` 死值 → 桌面与主站同宽 1280，但内容再 `padding 20px` 内缩 ~40px（比主站窄且不齐） | 论坛认 `--w-page`，去内缩，与主站栅格对齐 |

### 2.2 中等（M：秩序与留白）

| 页面 | 现状 | 目标 |
|---|---|---|
| 页头（25 页） | **两套页眉并存**：`page-hero--compact`+`.page-title`（42px，5 个列表页）vs `page-hero`+`.huge`（115.2px，20 页） | 抽 `<PageHero tier="hero\|compact">`；**功能页统一 compact**，仅首页 hero 保留 `huge`（D2） |
| AboutView | 正文卡内联 `640px`（2 处），1280 里半屏 | 用 `--w-read`(760)，与表单页一致 |
| FollowListView | `fl-list 720px` → 右侧空 560px | 用 `--w-read` 或改双列卡网格（跟随可用的宽度档） |
| SettingsView | 同页两个宽度：改密卡 440px vs 外观卡全宽（右缘差 ~800px） | 两卡同列同宽（`--w-read`） |
| NotificationsView | 无任何 ≤720 规则；`.notif-time{flex-shrink:0}` 在 375px 与正文抢位（`skeleton-extended.css:139-176`） | 补 ≤720：时间换行到第二行右侧 |
| TagDetailView | `<h1 class="huge">model:ds-unknown</h1>`（115.2px 的内部标识） | compact 档 + **显示值标签，标识降为 eyebrow**（key 移到副标题，`t('tag.model')·ds-unknown`） |
| ModelDetailView | 115.2px 的 slug 标题；`archive-grid` 实测 4 轨中 2 轨 0 宽 | compact 档 + 显示名称优先（slug 降为副标题）；栅格改 `auto-fit minmax(280px,1fr)` |
| Login/Register/404 | 440–640px 表单列 + `huge` 巨字 | compact；404 的 `nf-map 640px`→`--w-read` |
| TagListView | 面包屑再套一层 `.container` → 1248px，比其下内容（1280px）内缩 16px（对照 TagDetailView 无嵌套） | 去嵌套 |
| HomeView | 侧栏 sticky+独立滚动区（`HomeView.vue:838-843`）叠全站 16px 滚动条；移动 hero **808px**（视口 844）| 侧栏改 `position:sticky` 不加内部滚动；移动 hero 压到 ≤480px（h1 40px + 统计折叠） |
| ExploreView | `explore-labels` 实测 4 轨第 4 轨 0 宽 | `auto-fit` 化 |

### 2.3 轻微（L）

- `demo-detail.css:71 repeat(3,1fr)`、`:160 14px minmax(0,1fr) 26px`、`demo-next.css:6`、`upload-wizard.css:194` 硬栅格补小屏改档
- 转场 250ms 内 `position:fixed` 以根为包含块（`motion.css:138-140`）→ 转场期间抑制页内 fixed 元素
- LoginView/AdminView 根 div 缺 `.route-page`（该类**全站无样式**，20 视图在包、0 处 CSS）→ 要么定义它（承 `--w-page`），要么停止使用
- 小触点（<32px 高）：首页 14、作品详情 13、上传 12、模型 7 → 统一最小 36×36 触控区

---

## 3. 跨页模式收敛（组件化）

审计列出 7 类"同一件事多种实现"，这是"屎山"的真正来源：

| 模式 | 现有变体 | 收敛为 |
|---|---|---|
| 页眉 | 2 套字号档 + `HomeView.hero-v2` 私有变体 | `<PageHero>` |
| 工具条搜索框 | 全局 `flex:1`(420px) vs 内联 `max-width:320px`(4 页) | `<Toolbar>` 带 `searchWidth` 档 |
| Tab / 筛选条 | `.tabs .tab` vs `.filter-row`+`.tag-chip` vs 同屏混排（`ForumListView.vue:134-145`、`LeaderboardView.vue:131-168`） | `<SegmentedTabs>`；筛选一律 chip |
| 空态 | `<EmptyBox>` 组件（6 处） vs 手写 `div.empty-box`（5 处） vs 塞进 empty-box 的定制态（3 处） | 一律 `<EmptyBox>`，支持 `kind="empty\|error\|notfound"` + 主行动 |
| 加载态 | `<LoadingRow>` vs 手写同构标记（5 处） | 一律 `<LoadingRow>` |
| 分页 | 无限滚动 vs `<PaginationBar>`（5 页） vs "加载更多"（3 页） vs 硬截 50（3 页） | **列表页统一无限滚动 + 到底提示**；表格/后台用 `<PaginationBar>`；干掉硬截 50 |
| 瀑布流 | JS `MasonryGrid`（280px 列） vs CSS `columns:3 280px`（4 页） | 统一 `MasonryGrid`（删 CSS 版，避免两套断行逻辑） |
| 详情事实清单 | `.dv-meter/.dv-cell` / `.dash-stats/.stat-card` / `.mini-stat` / `.tag-stat`（后两者逐字节重复） | `<FactGrid>` |

---

## 4. 功能补齐（来自功能缺口审计）

### 4.1 第一批（S，收益直接；建议随 Phase 1 一起做）

| # | 用户今天做不到 | 证据 | 改法 |
|---|---|---|---|
| 1 | 分辨后台列表"真 0 条"还是接口挂了 | `AdminUsersSection.vue:31-33`、`AdminAnnouncementsSection.vue:72-74`(+`:321`)、`AdminForumSection.vue:38-41,54-56`、`AdminTagsSection.vue:199-205` | 加载失败 → `<EmptyBox kind="error">` + 重试 |
| 2 | 知道关注失败 | `UserView.vue:31-37` `catch { // 静默 }` | toast + 回滚乐观状态 |
| 3 | 后端故障时看到错误+重试（现在显示"主题不存在"） | `index.ts:245-251` `catch { return null }` → `ForumTopicView.vue:43-44` | 区分 404 与 5xx；5xx 走错误态 |
| 4 | 知道"标记已读/全部已读"失败 | `stores/notifications.ts:36-38,46-48` | 同上 |
| 5 | 按生成耗时/运行平台筛作品 | `demos.py:317-319` vs `types.ts DemoListParams` + `DemosView.vue:290-298` | 补 `rounds/minutes/platform` 参数（`rounds` 已有 tag 绕过，`minutes/platform` 完全不可达） |
| 6 | 按厂商/状态筛模型 | `models.py:17-18` vs `ModelsView.vue:38-43` | 补筛选 UI |
| 7 | 模型页按 game facet 筛作品 | `models.py:36` vs `ModelDetailView.vue:42-47` | 同上 |
| 8 | 按分类筛题目 | `tasks.py:30` vs `TasksView.vue:21` | 同上 |
| 9 | 改模型 slug（只能手敲 `?tab=aliases`） | `AdminView.vue:14` 有 tab 常量、`:44` 懒加载组件，但 `TAB_GROUPS`(:68-99) 无入口，全仓无 `goTab('aliases')` | 在模型详情页加"改名"入口（危险操作 + 二次确认） |
| 10 | 编辑作品时绕过重复内容 409 | `demos.py:1238` vs `index.ts:388-409`（创建路径有 `force=1`） | 编辑路径补 force |
| 11 | 把公告挂到指定作品 | `schemas.py:427` vs `AdminAnnouncementsSection.vue:101-110,127-136` | 表单补 `demo_slug`（用 EntityPicker） |
| 12 | 审批/删除后看到更新的侧栏徽章 | `AdminView.vue:179-182`；`AdminReviewSection.vue:18-29` 从不调 `refreshQueues` | 写操作后 `refreshQueues()` |
| 13 | 发完评论立刻看到讨论数变化 | `QuickComments.vue:97` vs `DemoView.vue:511,650` | emit 事件让父级刷新计数 |
| 14 | 知道下载失败 | `index.ts:413-417`（整页跳转，catch 永不触发） | 改 `fetch` + blob，或先探 HEAD |

### 4.2 第二批（M，需要动数据流）

| # | 用户今天做不到 | 证据 | 改法 |
|---|---|---|---|
| 15 | 看到最新 50 条以外的未读通知 | `NotificationsView.vue:27` + `stores/notifications.ts:23`（只发 `{page_size:50}`，视图本地过滤）；后端 `unread_only`+`page` 已存在（`notifications.py:30-32`）；**mock 已实现 `unread_only`（`mock.ts:2268`）→ 假象** | 走服务端 `unread_only` + 翻页 |
| 16 | 封禁用户后筛出被封者 | `AdminUsersSection.vue:116-119` vs `:89`（UI 会写出 `banned`，筛选无此项） | 补筛选 |
| 17 | 公告详情（后端有 `GET /announcements/{id}`、`GET /admin/announcements/{id}`，前端零调用） | `announcements.py:115,126` | 按需接（列表已含正文，可暂不接） |
| 18 | 标签分组后端接口（`GET /tags/admin/groups`）零调用，前端客户端算 | `tags.py:365` | 保持现状（客户端算无 bug），仅在分组量大时改 |
| 19 | 死包装 `api.listForumReplies` | `index.ts:277`（全仓 0 调用，同端点已有分页版） | 删 |

---

## 5. 执行顺序与验收

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0** | 令牌补齐（间距/字号/z/底栏高）+ 断点收敛 + 清死文件 + 拆分 `_mobile-responsive.css` | 截图**逐像素对照**应无变化（除死规则删除处）；`lint/typecheck/lint:css/test/build` 全绿 |
| **P1** | 移动端致命 3 项（底栏遮挡 ×3）+ TagListView 单列 + TaskDetail 表格 + UploadView 宽度 | 390px 截图：动作条/sheet 可见可点；表格可横滚；零横向溢出 |
| **P2** | 页头/工具条/空态/加载/分页/瀑布流/事实清单 7 类收敛 | 每类只剩一套实现（grep 计数为证） |
| **P3** | 逐页布局改造（H→M→L，§2） | 每页改前/改后截图并排；`measure` 指标改善（闲置宽度、0 宽轨道、小触点归零） |
| **P4** | 功能补齐（§4.1 S → §4.2 M） | 每条一个用例（前端 vitest / 后端 pytest 视归属） |

**每阶段固定动作**：`npm run lint && npm run typecheck && npm run lint:css && npm run test && npm run build` + 截图对照 + 一个提交 + 推送（CI 5 道门 + model-gate）。

---

## 6. 明确不做

| 不做 | 理由 |
|---|---|
| 换视觉语言 / 换 UI 框架 | D1；现有令牌层是资产 |
| 动 `frontend/src/astra/**` | 按域名分叉的独立橱窗 SPA，`astro.css` 不进主站 styles 链，独立风险面 |
| RF-5b i18n 中文单一来源 | 三类痛点已被 i18n 门禁覆盖，代价是跨 90 个 .vue 的 1475 处机械替换 |
| 恢复上传页二栏 / 救活论坛 860px | 都是死值；单列与 1280 是更正确的目标态 |
| 顺手改视觉细节（配色/阴影/边框） | 与"重布局"混做会让截图对照失去意义 |

---

## 7. 已知风险

1. **P0 的 `_mobile-responsive.css` 拆分**是全套里最容易出回归的一步（53 个同特异性覆盖的胜负依赖导入序）。做法：拆一条、截图对照一条，不合批。
2. **页宽三档（D3）是最显眼的变化**。建议 P3 单独一个提交，便于整体回退。
3. **`measure` 的 `kids` 指标**：`main` 常只有 1 个 `route-page` 包裹层，第一版探针量不到分区（已修为逐层下钻）；后续所有几何结论以新脚本为准。
4. **`.route-page` 无样式**（20 视图在用、0 处 CSS）：若在 P3 给它定义宽度，会一次性影响 20 页 → 必须放在 P3 单独提交并全量截图。

---

## 附：本次审计的自我纠正（避免误报进方案）

- `/forum/topic/99999` 在 **mock** 下渲染空白 → 真实后端显示「主题不存在或未上线」。**非线上 bug**，是 mock 不抛错。
- `/tasks/<不存在>` 实测空白 → 同为 mock 假象；真实后端显示「题目不存在或未上架」。
- 早前"CSS 同名类重复 33 次"的说法是**前缀匹配假象**（那是 33 个不同选择器 + `@keyframes` 步骤）；真实"同选择器多处定义"= 152/1205，其中单文件内 49 组（34 组真冲突）。
- 论坛 `forum.css`(860) 与 `forum-lite.css`(1280) 不是"两套皮"，**860 是全区间死值**（布局审计已证）。
