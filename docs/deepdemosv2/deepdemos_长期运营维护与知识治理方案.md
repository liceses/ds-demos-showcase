# deepdemos.top：模型能力数据库长期运营与维护方案

> **目标：**
>
> deepdemos.top 从“AI Demo 作品库”逐步升级为“从真实 Demo 观察模型能力的数据库”后，最大的挑战不再只是技术实现，而是：
>
> **如何让 Model、Task、Prompt、Generation、Demo、Tag 这些概念在未来几年持续增长，而不逐渐失控。**
>
> 本方案的核心思想是：
>
> > **管理员不应该每天人工维护一张越来越大的标签表，而应该维护一套“知识体系治理系统”。**
>
> 系统负责收集、推荐、发现异常、统计和批量处理；管理员负责制定规则、审核高价值变化、处理冲突和维护体系边界。

---

# 一、最重要的运营原则

整套长期运营方案先固定 8 条原则。

## 1. 管理对象不是“标签”，而是“知识体系”

后台最终管理的应该是：

```text
Model
Task
Taxonomy / Category
Technology
Feature
Tag
Prompt
Generation
Demo
Alias / Relation
```

其中：

- Model：模型实体
- Task：任务实体
- Prompt：具体任务描述
- Generation：一次生成过程
- Demo：生成结果
- Taxonomy：分类体系
- Tag：属性和检索标签
- Alias：别名
- Relation：标签、模型、Task 之间的关系

不要把所有东西都继续塞进 Tag。

---

## 2. “创建”和“维护”分离

最佳实践：

> **普通用户可以贡献候选内容，但不能直接改变全站知识体系。**

例如用户发现：

```text
新模型
新标签
新 Task
新技术
标签别名
```

用户做的是：

```text
提交候选
```

管理员做的是：

```text
审核
合并
归一化
批准
拒绝
废弃
```

这样可以让系统保持开放，同时避免体系被用户输入污染。

---

## 3. 自动化发现，人工做边界判断

AI 很适合：

```text
发现
推荐
匹配
聚类
去重
预分类
```

不适合未经限制地：

```text
自动创建无限新标签
自动重命名核心分类
自动删除已有实体
自动改变全站分类结构
```

原则：

> **AI 负责提高运营效率，人负责决定知识体系的边界。**

---

## 4. 能合并就不要创建新的

运营中最常见的问题不是缺标签，而是：

```text
three.js
threejs
Three JS
Three.js
```

变成四个标签。

所以后台必须把：

> **“发现重复”**

放在：

> **“创建新标签”**

之前。

---

## 5. 废弃而不是删除

任何已经被 Demo 使用过的：

```text
Model
Task
Tag
Technology
```

都不应该随意物理删除。

应该：

```text
active
deprecated
merged
hidden
```

状态化管理。

例如：

```text
threejs
   ↓
merged_into
   ↓
three.js
```

旧 ID 仍然保留，历史数据不会断。

---

## 6. 任何自动变化都应该可追溯

必须知道：

```text
谁改的
什么时候改的
改了什么
为什么改
来源是什么
修改前是什么
修改后是什么
```

尤其是：

```text
AI 自动打标签
AI 自动 Task 聚类
模型归一化
标签合并
```

都应该有审计记录。

---

## 7. “知识体系稳定”比“标签数量丰富”更重要

不要把：

```text
Tag Count
Model Count
Task Count
```

当成运营 KPI。

真正重要的是：

```text
重复率
孤立率
错误率
缺失率
审核积压
搜索命中率
用户修改率
自动推荐采纳率
```

---

## 8. 从第一天开始考虑迁移

今天只有几十个 Model、几百个 Tag，很多事情看起来可以手动做。

但未来可能：

```text
10,000+ Demo
1,000+ Model
5,000+ Task
20,000+ Tag
```

所以任何运营流程从一开始都要支持：

```text
批量
搜索
过滤
导入
导出
合并
回滚
审计
```

---

# 二、管理员后台最终应该是什么

不要继续做：

```text
Tag Admin
Model Admin
Task Admin
Demo Admin
```

各自完全独立、互相不知道对方。

建议最终形成一个：

# Knowledge Center / 知识中心

```text
知识中心
│
├── 总览 Dashboard
│
├── 待处理 Inbox
│   ├── 新模型
│   ├── 新标签
│   ├── 新 Task
│   ├── AI 建议
│   ├── 重复项
│   ├── 冲突项
│   └── 低质量数据
│
├── Models
│
├── Tasks
│
├── Taxonomy
│
├── Tags
│
├── Relations
│
├── Generations
│
└── Audit Log
```

其中真正最常用的页面不是“所有数据”。

而是：

> **Inbox / 待处理中心。**

---

# 三、管理员最需要的是“待处理队列”

管理员打开后台，第一眼应该看到：

```text
待处理：37

新模型                  3
重复模型建议             5
新标签                  12
疑似重复标签             7
Task 合并建议             4
错误关联                  2
AI 低置信度推荐            4
```

然后管理员逐条处理：

```text
接受
拒绝
合并
修改
忽略
稍后处理
```

这比让管理员打开：

```text
Tag 表 → 搜索 → 找东西 → 编辑
```

高效得多。

---

# 四、建立“知识实体生命周期”

每一种核心对象都应该有生命周期。

---

## Model 生命周期

```text
discovered
    ↓
candidate
    ↓
verified
    ↓
active
    ↓
deprecated
    ↓
archived
```

说明：

### discovered

系统从 Demo / Prompt / 外部模型信息中发现：

```text
Qwen-New-Model
```

但还不能确定是否真实。

### candidate

进入管理员待审队列。

### verified

确认：

- 名称
- 厂商
- 模型身份
- 别名

### active

正式出现在站内。

### deprecated

模型已经过时，但历史 Demo 仍需要它。

### archived

停止普通展示，但保留历史数据。

---

# 五、Task 生命周期

Task 比 Model 更容易发生重复，所以必须设计：

```text
candidate
active
merged
split
deprecated
```

重点是支持：

## Merge

例如：

```text
3D 地球仪
互动地球
Web 地球仪
```

管理员判断后：

```text
Canonical Task:
交互式 3D 地球
```

其他变成：

```text
Alias / merged_into
```

---

## Split

反过来也可能发生：

```text
Task:
数据可视化
```

一开始很粗。

随着 Demo 增长发现实际上包含：

```text
统计图表
数据仪表盘
地理可视化
科学可视化
```

那么管理员可以：

```text
一个 Task
↓
拆成多个 Task
```

因此：

> Task 系统必须支持“合并”和“拆分”。

---

# 六、Tag 生命周期

推荐：

```text
suggested
active
deprecated
merged
hidden
```

不要：

```text
创建
删除
```

这么简单。

---

## 标签合并

例如：

```text
threejs
three.js
Three JS
```

最终：

```text
Canonical:
three.js

Aliases:
threejs
Three JS
```

历史 Demo 全部自动迁移到 canonical。

---

## 标签废弃

例如：

```text
WebGL1
```

如果未来不建议继续使用：

```text
status = deprecated
```

历史 Demo 不动。

新上传页面不再推荐。

---

# 七、Model 管理的最佳实践

Model 后台不要只是：

```text
名称
数量
编辑
删除
```

建议字段至少分成：

```text
Identity
├── canonical_name
├── display_name
├── provider
├── family
├── version
├── aliases
└── external_ids

Status
├── candidate
├── verified
├── active
└── deprecated

Usage
├── demo_count
├── task_count
└── recent_usage

Relations
├── family
├── successor
├── predecessor
└── aliases
```

---

# 八、模型的“创建”应该尽量自动完成

最常见情况是：

用户上传：

```text
model:
deepseek-v4-flash
```

系统发现数据库已有：

```text
DeepSeek V4 Flash
```

应该：

```text
自动匹配
↓
直接关联
```

而不是：

```text
再创建一个 Model
```

只有匹配不到的时候：

```text
产生“新模型候选”
```

进入管理员 Inbox。

---

# 九、模型重复检测

可以建立三层匹配：

## 第一层：精确匹配

```text
canonical name
external id
```

## 第二层：Alias 匹配

```text
deepseek-v4-flash
DeepSeek V4 Flash
ds-v4-flash
```

## 第三层：语义匹配

AI 判断：

```text
是否可能是同一个模型
```

输出：

```text
95% 疑似重复
```

管理员只需要：

```text
合并
```

---

# 十、Task 管理是整个后台最需要 AI 的地方

管理员没必要自己阅读几千条 Prompt。

系统每天可以生成：

```text
Task 聚类建议

Cluster #184
相似 Prompt：17

建议名称：
俄罗斯方块网页游戏

代表 Prompt：
...

相关 Model：
DeepSeek
Qwen
Claude
...
```

管理员只需要：

```text
接受 Task
修改名称
拆分
忽略
```

---

# 十一、Task 聚类的最佳实践

不要只靠 Prompt 文本。

建议结合：

```text
Prompt
+
Demo 标题
+
Demo 描述
+
技术栈
+
代码特征
+
已有 Task
```

然后生成相似度。

但自动聚类只能产生：

> **候选 Cluster**

不要直接把 Cluster 当最终 Task。

---

# 十二、建立“Canonical Entity”原则

每一种核心实体都必须有一个规范实体：

```text
Canonical Model
Canonical Task
Canonical Tag
Canonical Technology
```

所有：

```text
别名
错别字
旧名称
厂商叫法
用户叫法
```

都指向 Canonical。

例如：

```text
Canonical:
DeepSeek V4 Flash

Aliases:
DeepSeek-V4-Flash
deepseek v4 flash
DS V4 Flash
```

系统内部永远使用：

```text
canonical_id
```

展示层可以显示：

```text
display_name
```

这是长期维护的关键。

---

# 十三、建立 Alias 管理中心

后台单独提供：

```text
Aliases

待确认：
threejs → three.js
ds-v4 → DeepSeek V4
qwen38 → Qwen 3.8
```

管理员可以：

```text
确认
修改
拒绝
```

这样标签和模型的名称归一化就能持续维护。

---

# 十四、Relations：不要把所有关系硬编码

未来可能出现：

```text
Model A
 ├── successor → Model B
 ├── family → Model C
 └── alias → Model D
```

标签：

```text
3D
 ├── related → WebGL
 ├── implies → graphics
 └── parent → visual
```

Task：

```text
Tetris
 ├── related → Snake
 └── parent → Browser Game
```

建议统一抽象：

```text
EntityRelation
```

至少支持：

```text
relation_type
source_id
target_id
confidence
source
created_by
```

这样以后扩展不会不停增加数据库字段。

---

# 十五、不要一开始把“关系图谱”做得过度复杂

关系系统应该遵循：

> **先支持少量高价值关系。**

第一阶段只需要：

```text
alias_of
merged_into
parent_of
related_to
implies
```

不要一开始建设几十种 relation。

否则管理员本身也无法理解。

---

# 十六、AI 推荐系统应该分级

强烈建议把 AI 建议按置信度分层。

## 高置信度

例如：

```text
99%
已有 Model 的标准别名
```

可以：

```text
自动接受
```

但必须保留日志。

---

## 中置信度

例如：

```text
87%
疑似属于 Task X
```

进入：

```text
管理员待审核
```

---

## 低置信度

例如：

```text
54%
可能属于 3D
```

不要骚扰管理员。

可以：

```text
记录
等待更多数据
```

---

# 十七、AI 自动操作的安全边界

建议明确：

## AI 可以自动做

```text
标准化大小写
去空格
Alias 建议
重复检测
推荐 Tag
推荐 Task
推荐 Model
统计
异常检测
```

## AI 默认不能自动做

```text
删除实体
改变 Canonical
删除大量关联
移动顶级分类
合并大量历史数据
改变核心 taxonomy
```

这些需要人工确认。

---

# 十八、上传者贡献机制

用户发现新东西时，不要直接开放数据库编辑。

用户看到：

```text
找不到模型？
+ 新增模型
```

点击：

```text
提交模型候选

名称：
厂商：
官网：
模型链接：
```

提交后：

```text
candidate
```

进入管理员 Inbox。

---

# 十九、用户报告也应该进入同一个 Inbox

例如：

```text
举报标签错误
模型选错
Task 归类错误
Demo 标签缺失
重复 Demo
模型名称错误
```

不要分别放到：

```text
Tag Admin
Demo Admin
Model Admin
```

而应该统一：

```text
Moderation / Knowledge Inbox
```

---

# 二十、建立“数据质量巡检”

管理员不可能每天人工查所有 Demo。

因此系统每天 / 每周自动跑数据质量任务。

例如：

```text
缺失 Model
缺失 Category
Task 孤立
过时 Model
重复 Tag
无效 Alias
孤立 Tag
过多 Tag 的 Demo
从未被使用的 Tag
高频但未标准化的 Tag
```

输出：

```text
Quality Report
```

---

# 二十一、最值得做的几个质量指标

## Tag Coverage

```text
有核心 Tag 的 Demo / 全部 Demo
```

例如：

```text
Model Coverage      97%
Type Coverage       94%
Technology Coverage 72%
Task Coverage       61%
```

这样可以知道哪里需要优化。

---

## Duplicate Rate

```text
疑似重复实体 / 实体总数
```

---

## AI Suggest Acceptance

```text
AI 推荐被管理员接受的比例
```

如果：

```text
Model 推荐采纳率 99%
```

说明模型匹配规则已经很好。

如果：

```text
Task 推荐采纳率 41%
```

说明 Task 聚类还不成熟。

---

# 二十二、不要用“标签数量”当 KPI

不建议：

```text
本月新增 500 标签
```

这甚至可能是坏事。

更好的运营指标：

```text
搜索成功率
标签覆盖率
模型识别率
Task 匹配率
重复率
人工审核时长
AI 建议采纳率
用户纠错率
孤立实体数量
```

---

# 二十三、建立“Taxonomy 版本”

这是长期维护非常重要的一项。

分类体系以后肯定会变化。

例如：

```text
Taxonomy v1
游戏
3D
工具
...
```

后来：

```text
Taxonomy v2
游戏
 ├── 2D
 ├── 3D
 └── 模拟
```

不要直接覆盖历史。

应该记录：

```text
taxonomy_version
```

每次结构性修改：

```text
v1 → v2
```

并记录：

```text
change reason
changed nodes
migration result
operator
timestamp
```

---

# 二十四、重要变更必须有“发布机制”

普通操作：

```text
新增 Alias
修正描述
```

可以实时生效。

但重大变化：

```text
移动一级分类
大规模合并 Tag
修改核心 Model
Task 批量迁移
```

建议：

```text
Draft
 ↓
Review
 ↓
Approve
 ↓
Publish
```

即：

> **知识体系也应该有类似代码的发布机制。**

---

# 二十五、批量操作必须支持 Preview

例如管理员选择：

```text
合并 37 个标签
```

点击：

```text
Preview
```

系统显示：

```text
会影响：

Demo：1832
Task：73
Search Index：...
```

管理员确认后再执行。

这比直接：

```text
Merge
```

安全得多。

---

# 二十六、所有危险操作都应该支持 Rollback

尤其：

```text
Merge
Bulk Edit
Migration
Taxonomy Move
Model Replacement
```

必须保留：

```text
Operation ID
Before Snapshot
After Snapshot
Operator
Timestamp
```

出现错误可以：

```text
Rollback Operation #1842
```

---

# 二十七、管理员角色建议

不要一开始设计十几种权限。

第一阶段 3～4 个角色足够：

## Super Admin

负责：

```text
Taxonomy
Model
系统配置
危险操作
```

## Knowledge Editor

负责：

```text
Tag
Model
Task
Alias
Relations
```

## Moderator

负责：

```text
Demo
举报
用户提交
内容质量
```

## Analyst

只读：

```text
Dashboard
统计
模型能力数据
运营报告
```

原则：

> **能审核的人，不一定能修改系统结构。**

---

# 二十八、管理员首页 Dashboard

推荐第一屏：

```text
知识中心

今日待处理             37
────────────────────────

新模型                   3
新 Task                  8
新 Tag                   12
重复建议                 7
错误关联                 4
举报                     3

────────────────────────

数据质量

Model Coverage          97%
Task Coverage           71%
Tag Duplicate Rate       4%
AI Suggest Acceptance   89%

────────────────────────

知识体系

Models                  142
Tasks                   681
Tags                   2480
Technologies             93
Demos                  8231
```

这会比“数据库 CRUD 页面”好用得多。

---

# 二十九、Model 后台页面

推荐：

```text
Models

搜索：________________

[全部] [待审核] [活跃] [废弃] [疑似重复]

┌──────────────────────────────────┐
│ DeepSeek V4 Flash                │
│ DeepSeek                         │
│ 128 Demos · 42 Tasks             │
│ Aliases: 4                       │
│                                  │
│ [查看] [编辑] [合并建议]          │
└──────────────────────────────────┘
```

点击进入：

```text
模型详情
├── 基本信息
├── Alias
├── Demo
├── Task
├── 关系
├── 数据质量
└── Audit
```

---

# 三十、Task 后台页面

Task 页面尤其应该强调：

```text
成员 Demo
参与 Model
Prompt 样本
相似 Task
```

例如：

```text
Task：俄罗斯方块网页游戏

Models:
DeepSeek  12
Qwen       8
Claude     6
GPT        5

Prompts:
37

Demos:
31

疑似重复 Task:
2
```

管理员可以直接看到：

> 这个 Task 到底是不是一个有意义的比较单位。

---

# 三十一、Tag 后台页面

不要只显示：

```text
名称
数量
删除
```

应该显示：

```text
Tag：three.js

状态：Active
类型：Technology

使用 Demo：184

Alias：
threejs
Three JS

Parent：
Web Graphics

Implies：
WebGL
3D

Related：
Babylon.js

质量：
Canonical ✔
重复候选：0
```

这才是真正的“标签治理”。

---

# 三十二、引入“观察期”

新建的：

```text
Tag
Task
Model
```

不要一创建就永久固定。

可以：

```text
candidate
```

先观察一段时间。

例如：

```text
使用次数 > N
```

或者：

```text
管理员确认
```

之后升级：

```text
active
```

这样可以防止大量低价值实体污染主体系。

---

# 三十三、低频 Tag 不应该全部删除

有一些标签虽然：

```text
使用次数 = 1
```

但实际上很有价值。

因此不要简单：

```text
count < 3 → delete
```

应该结合：

```text
使用次数
语义价值
是否属于核心分类
是否有未来潜力
是否是用户明确要求
```

低频只是：

> 需要观察。

不是：

> 没有价值。

---

# 三十四、建立“热门 + 核心 + 长尾”结构

标签体系可以分成：

```text
Core
Popular
Long Tail
Deprecated
```

这样上传页面不需要展示全部。

例如：

```text
核心：
游戏
工具
可视化
3D

热门：
Three.js
WebGL
Canvas

长尾：
某个具体库
某个特殊效果
```

这样可以解决“标签越来越多”的 UI 问题。

---

# 三十五、推荐标签排序不要只按字母

应该优先：

```text
1. 核心性
2. 用户常用程度
3. 当前 Demo 相关性
4. 模型 / Prompt 推断结果
5. 历史采纳率
6. 最近热门程度
```

这样上传者看到的第一批标签，才是真正“最可能有用”的标签。

---

# 三十六、为每个 TagKey 定义“治理策略”

这会是整个系统非常重要的一层。

例如：

```text
Model
- 必须标准化
- 禁止自由创建
- 自动匹配
- 管理员确认新值

Category
- 严格控制层级
- 不允许用户自由创建一级分类

Technology
- 半开放
- 支持 Alias
- 支持 AI 推荐

Feature
- 相对开放
- 可以批量合并
```

换句话说：

> **不同维度的知识，不应该用同一套运营规则。**

---

# 三十七、推荐建立 TagKey Policy

可以抽象为：

```text
TagKeyPolicy

creation_mode
selection_mode
approval_required
max_values
allow_alias
allow_parent
allow_ai_create
show_on_upload
show_on_filter
show_on_card
```

这样管理员真正管理的是：

> “这一类知识应该如何治理”。

而不是天天改标签。

---

# 三十八、数据来源必须记录

每个元数据最好知道来源：

```text
source:
user
admin
ai
inferred
external
imported
```

例如：

```text
Technology:
Three.js

source = user
```

或者：

```text
WebGL
source = inferred
confidence = 0.98
```

这样未来才知道哪些数据值得重新检查。

---

# 三十九、建立“纠错闭环”

用户可能发现：

```text
模型错了
标签错了
Task 错了
```

用户点击：

```text
纠正
```

而不是默默忽略。

流程：

```text
User Report
 ↓
Knowledge Inbox
 ↓
AI 分析
 ↓
管理员处理
 ↓
修改实体
 ↓
记录原因
 ↓
重新训练 / 调整规则
```

这会形成长期的数据质量反馈循环。

---

# 四十、运营节奏

建议不要让管理员“想到哪改到哪”。

建立固定节奏。

## 每天

处理：

```text
新模型
用户纠错
高置信度重复
高置信度 Tag
```

目标：

> Inbox 不长期积压。

---

## 每周

检查：

```text
Task 聚类
Tag 重复
模型 Alias
低质量数据
AI 推荐准确率
```

生成：

```text
Weekly Knowledge Report
```

---

## 每月

进行：

```text
Taxonomy Review
Model Review
热门 Task Review
长尾 Tag Review
运营指标 Review
```

重点决定：

```text
哪些分类需要调整
哪些 Tag 应合并
哪些 Task 应拆分
哪些 AI 规则需要修改
```

---

## 每季度

做一次：

```text
知识体系版本升级
```

例如：

```text
Taxonomy v1.3 → v1.4
```

同时做：

```text
数据库审计
索引检查
历史数据清洗
备份恢复演练
规则复盘
```

---

# 四十一、建议建立“变更日志”

每一次知识体系重要修改都记录：

```text
Change #1842

Type:
Tag Merge

Before:
threejs
Three JS
three.js

After:
three.js

Affected:
184 Demos

Operator:
Admin

Reason:
Alias normalization

Time:
2026-08-28
```

以后出现问题非常容易定位。

---

# 四十二、数据库备份不是唯一安全措施

至少要有：

```text
数据库备份
+
操作日志
+
变更快照
+
Migration
+
Rollback
```

不要只依赖：

> “我每天备份数据库。”

因为数据库恢复后，你仍然可能不知道：

```text
哪一次 Merge 出问题
```

---

# 四十三、建议所有知识变更通过 Service 层完成

不要让后台 UI 直接：

```text
UPDATE tags
```

建议统一：

```text
Knowledge Service
```

例如：

```text
merge_tag()
merge_model()
merge_task()
deprecate_tag()
publish_taxonomy()
accept_suggestion()
```

这样：

```text
Admin UI
API
AI Worker
Migration Script
```

都通过相同业务规则操作。

这是防止系统长期腐化的重要最佳实践。

---

# 四十四、批量任务应该异步化

例如：

```text
把 3000 个 Demo 的旧 Tag 合并到新 Tag
```

不要让 HTTP 请求一直等。

使用：

```text
Job
 ↓
Progress
 ↓
Success / Failure
 ↓
Operation Log
```

管理员可以看到：

```text
Migration #182

1832 / 2417
```

---

# 四十五、Search Index 与数据库分开考虑

标签系统越来越成熟后：

```text
Database
```

负责：

```text
事实
关系
事务
```

而：

```text
Search Index
```

负责：

```text
搜索
模糊匹配
Alias
推荐
聚合
```

这样：

```text
用户搜索 “threejs”
```

可以命中：

```text
three.js
```

但数据库里只有一个 Canonical Entity。

---

# 四十六、推荐的长期数据流

最终整个运营链路应该是：

```text
用户上传
      ↓
系统解析
      ↓
Model 匹配
      ↓
Prompt 分析
      ↓
Task 推荐
      ↓
Tag 推荐
      ↓
Relations 推导
      ↓
用户确认
      ↓
Demo 发布
      ↓
Knowledge Inbox
      ↓
AI 质量巡检
      ↓
管理员处理异常
      ↓
知识体系更新
      ↓
统计 / Explore / Model Page
```

这个闭环建立起来后，管理员的工作量不会随着 Demo 数量线性增长。

---

# 四十七、目标不是“自动化一切”

真正理想的状态不是：

```text
AI 全自动管理网站
```

而是：

```text
Demo 增长 10 倍
↓
人工工作量只增加 2～3 倍
```

原因是：

```text
机器处理重复工作
管理员处理判断工作
```

这才是健康的长期运营结构。

---

# 四十八、推荐的后台权限边界

建议：

```text
普通管理员
├── Inbox
├── Tag
├── Model
├── Task
└── Relation

知识管理员
├── Taxonomy
├── Canonical
├── Merge
├── Alias
└── Publish

超级管理员
├── Migration
├── Rollback
├── System Policy
└── Permission
```

危险操作统一需要：

```text
二次确认
```

对大规模操作甚至要求：

```text
Preview
→ Confirm
```

---

# 四十九、最重要的三个“千万不要”

## 不要 1：让管理员直接面对全部实体

错误：

```text
25000 个 Tag
```

正确：

```text
今天需要处理 12 个问题
```

---

## 不要 2：让 AI 直接修改 Canonical

AI 可以：

```text
建议：
A 可能是 B
置信度 96%
```

管理员：

```text
确认
```

---

## 不要 3：不要为了所谓“完整”不断扩大 Taxonomy

体系应该满足：

> **足够表达实际 Demo，并且能够稳定维护。**

不是：

> 理论上把整个互联网分类完。

---

# 五十、最终应该形成三个后台中心

长期来看，后台可以收敛成三个核心区域：

## 1. Knowledge Center

维护：

```text
Model
Task
Tag
Taxonomy
Relation
Alias
```

---

## 2. Operations Center

处理：

```text
审核
纠错
举报
AI 建议
质量问题
批处理
```

---

## 3. Analytics Center

观察：

```text
模型表现
Task 分布
标签覆盖
用户行为
搜索
推荐
数据质量
```

这三个中心构成：

```text
知识建设
    ↓
运营维护
    ↓
数据反馈
    ↓
知识体系优化
```

---

# 五十一、最推荐的实施顺序

不要一次把所有东西做完。

## Phase 1：治理基础

先实现：

```text
Entity Status
Canonical
Alias
Audit Log
Inbox
```

这是最重要的底座。

---

## Phase 2：Model 治理

实现：

```text
Model Entity
Model Alias
Model Candidate
Model Merge
Model Detail
```

---

## Phase 3：Tag 治理

实现：

```text
Tag Policy
Canonical Tag
Alias
Merge
Deprecated
Relation
```

---

## Phase 4：Task 治理

实现：

```text
Task Candidate
Similarity
Cluster
Merge
Split
Task Detail
```

---

## Phase 5：AI 运营

实现：

```text
AI Tag Suggestion
AI Model Matching
AI Task Matching
Duplicate Detection
Quality Scan
```

---

## Phase 6：知识体系版本化

实现：

```text
Taxonomy Version
Draft
Review
Publish
Rollback
```

---

## Phase 7：模型能力数据层

最后才进一步做：

```text
Model Profile
Task Comparison
Capability Statistics
Model × Task Matrix
```

这样产品价值是在数据基础成熟后自然生长出来，而不是先做一个漂亮但空洞的排行榜。

---

# 五十二、最终的管理员工作模式

理想情况下，一个管理员每天不是：

```text
打开 Tag 表
↓
翻 500 页
↓
改名字
↓
删重复
↓
继续翻
```

而是：

```text
打开 Knowledge Center

今天：
────────────────────────

12 个高置信度自动建议
7 个用户纠错
3 个新模型
4 个 Task 聚类
2 个重复标签

      ↓

逐条处理

接受 / 合并 / 修改 / 拒绝

      ↓

系统自动完成：

数据迁移
搜索索引更新
关联更新
历史记录
统计刷新
```

这才是一套可以随着网站长期增长的运营体系。

---

# 五十三、最终判断标准

以后每增加一个新的知识概念，都应该问五个问题：

### 1. 它是不是一个真正的实体？

如果是：

```text
Model / Task
```

应该独立。

### 2. 它是不是只是一个属性？

如果是：

```text
Tag
```

即可。

### 3. 它是否需要自己的生命周期？

如果需要：

```text
必须拥有独立管理能力。
```

### 4. 它是否需要被比较？

如果需要：

```text
应该尽量独立建模。
```

### 5. 它是否会产生大量用户贡献？

如果会：

```text
必须进入 Candidate → Review → Canonical 的治理链路。
```

这五个问题可以作为以后整个项目的设计守则。

---

# 五十四、最终架构愿景

最终 deepdemos 的后台不是：

```text
CRUD Admin
```

而应该是：

```text
             Knowledge Center
                    │
        ┌───────────┼───────────┐
        │           │           │
      Model        Task        Taxonomy
        │           │           │
      Alias       Prompt       Tag
        │           │           │
        └───────────┼───────────┘
                    │
                 Relation
                    │
                    ▼
                  Demo
                    │
                    ▼
              Generation
                    │
                    ▼
               Real Data
                    │
                    ▼
                Analytics
                    │
                    ▼
             Knowledge Improve
                    │
                    └──────────────→
```

这形成一个完整闭环：

> **内容产生知识，知识组织内容，数据反过来改善知识。**

这才是 deepdemos 从作品展示站走向长期数据库产品后，最值得建立的核心能力。

---

# 附：运营制度的一句话版本

以后团队内部可以直接把下面这段作为制度：

> **用户负责贡献，AI 负责发现，系统负责归一化与执行，管理员负责判断，Taxonomy 负责稳定边界，Audit 负责追溯，Analytics 负责反馈。**
>
> **不要让管理员维护数据；要让管理员维护规则。**
