
读完 docs/deepdemosv2/ 七份文档（落地计划.md / v2理想设想.md / 建议2.md / Ai相关.md 两份大参考文档正在后台精读中），并把文档逐条对照了工作区里已写好的 v2 代码。汇报 + idea 如下。
一、对 v2 方案本身的判断

方案是对的，而且罕见地克制。 三个亮点：明确红线（不做雷达图/总分/SOTA 排名）、明确分层（规则→算法→LLM→人工，且 v2.0 零 LLM 调用）、明确「架构先建立、功能慢慢长」。matching_service 作为「LLM 后置承重墙」的单文件边界设计，是整套文档里最值钱的一条工程决策。

但有一个结构性盲点：整套方案把 Task 当作「会有的东西」来设计，而 Task 恰恰是这个站现在最稀缺、且不会自己长出来的东西——文档 §3.3 自己实测承认了：game 标签只产生 3 个跨模型簇、标题前缀聚簇为 0。于是「Benchmark 自然涌现」这句话，实际依赖的是「管理员手工 seed」。v2 的成败不在数据模型，在于喂食入口。
二、文档 ↔ 代码 gap（我实际核对的）

B1 已落地的部分质量不错：6 张表、三个 service、公开只读 API、键内 OR/键间 AND 修正、serializer 预加载消 N+1、幂等迁移脚本、6 个测试。但它是个「只读半环」：
计划要求	实际状态
POST/PUT/DELETE /admin/models、/merge、/aliases、/admin/tasks/{id}/demos 批量挂题	backend/app/routers/admin.py 零改动——service 里 merge_model/attach_demos/model_status_set 全部写好了却没有任何 HTTP 入口
entity_suggestions（收件箱）、audit_log（审计）	两张表都没建；merge 有 dry_run 却不落痕，直接违反治理铁律第 6 条「任何自动变化可追溯」
Demo 详情页「同题作品」+「同提示词」模块	未做（demos.py 只有旧的 /related）
/models /tasks 列表页、Explore 升级	只有 ModelDetailView.vue / TaskDetailView.vue 两个详情页，列表页不存在，路由进不去
迁移脚本实测	只在本地空库跑过「5 个 model 标签」；线上是 99 个 model 值 / 596 demos
测试	6 例全是 happy path，无 merge / 别名 / 迁移幂等 / astra scope×新路由 / 序列化回归

一句话结论：现在这份 B1 就算部署上去，用户端零可见变化，而 /tasks 会永远是空的——因为全站没有任何一条路径能创建一个 Task。
三、我的 idea（按价值排序）
idea 1 · Task 不要「建」，要从 Prompt 簇里「长」——反转依赖

现成资产被浪费了：prompt 覆盖 ~40%、content_hash 精确去重已实现、TF-IDF 索引已实现（backend/app/services/matching_service.py）。但这套能力现在只用来「给单个 demo 建议 task」——而 task 一个都没有，等于空转。

反过来用：把全库 prompt 跑一遍相似度 → 连通分量聚簇 → GET /admin/prompt-clusters 直接吐「17 条相似 prompt + 建议题名」。管理员只做两个动作：命名 + 点"成题"（一次点击 = 建 Task + 批量挂 demo）。冷启动从"人肉找题"变成"确认列表"，半天能出几十个 Task。这条几乎不写新算法，只是把已有的 TF-IDF 反向调用一次。
idea 2 · 把「ds-unknown 占 63%」做成产品，而不是当脏数据

368 个灰测作品是这个站最独特的资产。文档只把它当成"迁移时映射一下"的技术问题。我建议给 Model 实体加 resolved_to_id + resolved_at，做成**「灰测揭晓」机制**：某天 ds-unknown 被确认 → 一次操作全量归位 + 自动发公告 + 生成一张 /models/ds-unknown 揭晓回顾页（它做过哪些题、当时评分多少、如今归属谁）。

别的站没有「一个未公开模型的公开作品档案」这种内容——你的整活站 astra 吃的也正是这个红利，主站没理由不吃。
idea 3 · Run 别建表，但 rounds/time/platform 现在就该收编成 Run 元数据

文档要「预留 Run」。我反对现在建 runs 表：没有数据来源的表就是死表。但那三个标签本来就是"一次生成过程"的属性，不是描述性标签，放标签体系里既污染词表又没法排序聚合（time 值 70/230 语义不明就是这么来的）。

建议直接收编为 demo 列：gen_rounds / gen_minutes / gen_platform。收益立刻兑现在 Task 对比行上：从「只有 ★ 社区分」升级成「★ / 轮数 / 耗时」三指标小倍数对比——这才叫"从 Demo 观察模型能力"，比单一口味分可信得多。而且线上真实数据已经在证明用户想表达这个维度（有作品的 description 直接写着「修了12轮bug，共耗时17小时」）。
idea 4 · 先做「同题/同提示词」模块，后做 /tasks 列表页

没人会主动点导航栏的 "Tasks"。用户是看完一个 demo 之后才想「别的模型做这个会怎样」。所以 B3 的顺序应该反过来：Demo 详情页两个模块 → Task 页 → 最后才是列表页/Explore。

关键：「同提示词的其他作品」零 Task 依赖，今天就能上线（prompt_id 回填逻辑已在 demos.py 里跑着）。它是 v2 第一个用户能看见的价值，也是验证「同题对比有没有人点」的最便宜实验。
idea 5 · 把「挑战」做成可分享链接，让 Benchmark 自我生产

Task 页放「用你的模型挑战此题」→ /upload?task=<slug>&prompt_id=<id> 预填 + 一键复制原始 prompt。再往前一步：给 agent 上传通道加 task 字段并写进 agent-guide——站上 7 天 114 个上传里 agent 通道占比不低，让 agent 上传时直接挂题，比管理员事后挂题便宜一个数量级。冷启动从运营问题变成产品机制。
idea 6 · audit_log + entity_suggestions 现在就建表，UI 押后

这是地基不是功能：两张表 + service 里几行写入，成本半小时。收益是「谁把我的模型合并了」永远可查，且 LLM 接入时 source='llm' + confidence 直接有位置放（文档 §7.6 的三级置信度也才有落点）。表晚建 = 早期所有合并操作永久无痕。
idea 7 · 我建议砍掉/推迟这三件（唱反调）

    runs 表：同 idea 3，无数据源。
    上传强制 ≥1 model（D6）：匿名/agent 是上传主力，加必填字段=掉转化。改成「没填自动挂 ds-unknown（灰测）」——反正 63% 本来就是它，还顺带喂大了 idea 2 的资产池。
    Explore 四段聚合页：文档自己说 /tags "访问量低"，低访问页做大改造 ROI 最低。Explore 就让 Model 列表 + Task 列表两个入口承担，别造第三个聚合页。

四、我建议的批次重排
我的批次	内容	估计	相对原计划
B1.5 补地基	audit_log + entity_suggestions 两表；admin 写接口最小集（model status/alias/merge dry-run、task CRUD + 挂题）；tier seed 核对	0.5 天	原计划漏了，必须补
B2′ 今天就能看见的价值	Demo 详情页「同提示词的其他作品」+ Model 页闭环（ModelChips 已有）	1 天	提前，去掉 Task 依赖
B3′ Task 从 prompt 簇长出来	聚类建议接口 + 管理端一屏「成题」面板 + Task 页对比行	2 天	替代原「人工 seed 5~10 个」
B4′ 挑战机制	/upload?task= 预填 + agent-guide 增 task 字段	1 天	原计划没有
B5′ Run 元数据收编	rounds/time/platform → demo 列 + 对比行三指标	1 天	原计划推到"将来"
治理台	收件箱里真有东西了再做 UI	—	原 B4 押后
五、本地测试计划（按你说的：测完才谈推送）

    pytest 全套（现 19 例）+ 我补：merge/别名归一、迁移幂等重跑、astra scope × 新路由白名单（新增路由默认对橱窗不可见需实证）、双写一致性。
    契约快照测试（关键护栏）：serializer 预加载改造是最容易静默改坏字段的地方——抓一批 demo 的 v1 响应存 golden JSON，v2 跑一遍 diff，只允许新增字段。
    拿线上真实数据跑迁移：596 demos / 99 model 值的库快照 → --dry-run → 真跑 → 重跑幂等；校验 model 标签计数 == demo_models 计数。
    前端：vue-tsc -b 真门槛（不是 --noEmit 弱检查，你们自己踩过这个坑）+ vite build + 关键路径手点。
    性能基线：/demos?page_size=20 的实际 SQL 条数（应 ~60 → 5）、/models、/explore 耗时。

下一步问你一件事：先从哪儿开工？我的建议是 idea 4 的「同提示词模块」+ idea 1 的 prompt 聚类——两条都只吃现成数据、不依赖任何人工 seed，能在测试通过后立刻让站点有可见变化。要我直接开始，还是先把上面的 idea 落成一份 docs/deepdemosv2/评审与重排.md 存档？
两份大文档的精读报告都回来了（概念文档实为 1519 行、治理文档实为 2550 行，均无表结构/接口规格，字段级验收依据确认落在 `落地计划.md` + `v2理想设想.md` §九）。结合我刚又核了一轮代码，给你的 idea 打「补丁」——只讲新发现和变化：

---

# 一、文档内部打架，需要你拍板的三处

| 冲突 | 治理文档说 | 落地计划说 | 代码实际 | 我的裁决建议 |
|---|---|---|---|---|
| Model 状态机 | `discovered→candidate→verified→active→deprecated→archived` | `candidate\|active\|unverified\|deprecated` | 跟落地计划（`model_status_set` 只认四值） | **保留代码**：`unverified` 就是「灰测未确认」，恰好是 idea 2 揭晓机制的资产；在落地计划里补一段「与治理文档状态机差异裁决」 |
| source 枚举 | §38 明写 `user/admin/ai/inferred/external/imported` + confidence | `rule\|user\|agent` | 表还没建 | **采用治理文档六值**，它是唯一明写处 |
| Task 必须支持 split（§五） | 要求 | 未提 | 只有 `merge_task` | **押后**：Task 总量还是 0，连"粗 Task"都没有，split 无对象。文档标注 |

# 二、新发现的 B1 真实缺口（比上一轮清单更准）

1. **`Tag` 表没有 `source` 列**——概念文档 §十九 明确要求标签来源落库（`user/ai/inferred/admin`）。治理子代理把它列为 B1 就该有的地基。这是我上一轮漏掉的。
2. **Model 实体缺 identity 字段**：治理文档 §七 要求 `family/version/external_ids`，代码只有 slug/name/vendor/status。**这里我唱反调**：这三个字段现在没有任何数据源，加空列违反你自己「字段若不能服务探索问题就不该存在」的原则——押后到有真实来源（比如从 models.dev 同步）再迁移。
3. **合并防呆未证实**：`merged_into` 不得成环、不得指向非 active——`merge_model` 里没看到校验，进测试断言。
4. **好消息（实测修正我上轮的判断）**：`model_detail` 比我以为的完整——已有 `tasks`（参与题目 Top12）、`type_dist`/`game_dist` 行为档案、`aliases`、`merged_into`；`TaskDetailOut` 有 `compare`/`demos`/`demos_total`；`ExploreOut` 三段齐。缺口只剩 `task_count` 总数（现在只有 Top12）和「热门作品」。

# 三、治理子代理给的验收一句话，直接定为本地测试清单标题

> **「匹配不重复建、状态字段不缺、canonical 关系不成环、候选不外泄、写操作全走 service」**

好消息：`候选不外泄` 已实测通过（`list_models` 缺省只出 active+unverified，`list_tasks` 缺省 active）。

# 四、我的 idea 排序不变，但新增一条硬依据

治理文档 §十六置信度分层（高≈99% 自动接受但留日志 / 中≈87% 待审 / 低≈54% 只记录不骚扰）**正好是我 idea 6 建 `entity_suggestions` 表的验收规格**——建表时字段照这个设计，LLM 后置时零改动。另外我的 idea 1（prompt 簇 → 管理员点"成题"）被治理文档正面背书：§「禁止在无审查机制下无限自动创建 Task」——一次点击一题、人工命名，正是要求的最小审查。

# 五、更新后的测试清单（最终版）

1. pytest 全套 + 补：**幂等压测**（同一 model 字符串重复上传必须复用不新建——子代理点名这是 B1 最该压测的）、alias 归一、merge 防环/防指向非 active、astra scope × 新路由白名单、`?model=`/`?task=` × 键内 OR 组合。
2. 契约快照测试：v1 响应 golden 化，v2 只许增字段。
3. 线上真实库快照跑迁移三连：dry-run → 真跑 → 重跑幂等，校验 tag 计数 == demo_models 计数。
4. `vue-tsc -b` 真门槛 + `vite build` + 手点：Model 页 ← Demo 详情 ModelChip、`/demos?model=` 回流、同提示词模块。
5. 性能：`/demos?page_size=20` SQL 条数（目标 ~60→5）、`/models` `/explore` 基线。

---

文档阅读阶段到此闭环。**我的建议开工顺序不变**：idea 4「同提示词模块」+ idea 1「prompt 聚类成题」先行——两条只吃现成数据、可测、可立刻上屏。

两个选项：**A)** 直接开工（我会边写边补测试，全绿后给你验收清单再谈推送）；**B)** 先把这份「评审+重排+裁决」落成 `docs/deepdemosv2/评审与重排.md` 存档再开工。回 A 或 B 即可。