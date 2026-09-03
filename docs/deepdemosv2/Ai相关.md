这里的“AI”我建议**明确拆成两类**，因为它们承担的职责完全不同。

## 结论

在我前面的方案里，**大部分“AI 推荐 / AI 分析 / AI 归类”主要指 LLM，但“相似度、去重、聚类”不应该全部依赖 LLM。**

最佳实践应该是：

```text
                    AI 数据治理层
                         │
          ┌──────────────┴──────────────┐
          │                             │
       LLM 层                        算法层
          │                             │
   理解语义、生成建议              相似度、排序、统计
   分类、抽取、解释                聚类、去重、异常检测
          │                             │
          └──────────────┬──────────────┘
                         ▼
                  管理员审核 / 规则
```

也就是说，我建议你不要把整个系统设计成：

> “丢给一个大模型，让 LLM 帮我管理标签。”

而应该设计成：

> **算法负责发现候选，LLM 负责理解语义，规则负责约束，管理员负责最终治理。**

---

# 1. 哪些事情适合 LLM？

LLM 最擅长的是：

> **理解人类语言和复杂语义。**

比如用户上传：

```text
帮我做一个可以拖动旋转的 3D 地球，
能够显示国家边界和人口数据。
```

LLM 很适合抽取：

```text
Task:
交互式 3D 地球

Category:
数据可视化

Feature:
3D
交互

可能技术：
WebGL
Three.js
```

以及判断：

```text
“做一个网页俄罗斯方块”
```

和：

```text
“制作一个可以直接玩的 Tetris Web Game”
```

是不是同一个 Task。

这种工作非常适合 LLM。

---

# 2. 哪些事情更适合传统算法？

例如：

### 字符串标准化

```text
threejs
three.js
Three JS
```

这个完全没必要调用 LLM。

普通代码就能：

```text
lowercase
trim
normalize
replace
alias table
```

---

### 精确重复

```text
DeepSeek V4 Flash
DeepSeek V4 Flash
```

直接数据库查询即可。

---

### 相似度

大量文本的相似度也不建议：

```text
A 和 B
→ 调一次 LLM
```

这样成本太高。

更适合：

```text
Embedding
 ↓
向量相似度
 ↓
候选集合
```

例如：

```text
Prompt A
Prompt B
Prompt C
...
```

先通过 embedding 找：

```text
Top 20 Similar Prompts
```

然后再让 LLM 判断：

> “这 20 个里面哪些实际上属于同一个 Task？”

这是非常经典的：

> **算法召回 + LLM 重排 / 判断**

架构。

---

# 3. Task 聚类尤其应该这么做

不要：

```text
10000 个 Prompt
↓
LLM 两两比较
```

这是灾难。

而是：

```text
10000 Prompt
     ↓
Embedding
     ↓
Vector Index
     ↓
相似候选
     ↓
Clustering
     ↓
LLM 给 Cluster 命名 / 判断
     ↓
管理员确认
```

例如：

```text
Cluster #281

17 条 Prompt

“做一个俄罗斯方块”
“制作 Tetris 网页游戏”
“实现可玩的俄罗斯方块”
...
```

然后 LLM 给出：

```text
建议 Task：
俄罗斯方块网页游戏

置信度：
0.94
```

管理员点：

```text
接受
```

就完成了。

---

# 4. AI 标签推荐也应该“算法 + LLM”结合

比如一个 Demo：

```text
标题：
3D 银河模拟器

Prompt：
制作一个可以拖拽观察的 3D 银河，
支持恒星运动和缩放。
```

可以先由规则 / 数据库产生候选：

```text
已有技术：
Three.js
WebGL

已有分类：
3D
Simulation
Visualization
```

再让 LLM 判断：

```text
哪些 Tag 最相关？
哪些不应该加？
```

最终：

```text
推荐：

[3D]       98%
[模拟]      96%
[可视化]    91%
[WebGL]     87%
```

---

# 5. Model 匹配也不应该只靠 LLM

例如用户输入：

```text
deepseek-v4-flash
```

数据库已有：

```text
DeepSeek V4 Flash
```

首先：

```text
Exact match
```

找不到：

```text
Alias match
```

再找不到：

```text
Fuzzy match
```

再不确定：

```text
Embedding
```

最后才：

```text
LLM 判断
```

所以应该是：

```text
便宜的算法
   ↓
较复杂的算法
   ↓
LLM
   ↓
人工
```

而不是反过来。

---

# 6. 这其实对应四层系统

我非常建议你把这个概念直接写进项目架构。

## 第一层：Deterministic Rules

最可靠、最便宜。

```text
字符串标准化
Alias
Exact Match
数据库约束
业务规则
黑名单
白名单
```

---

## 第二层：Statistical / ML Algorithms

负责大规模计算。

```text
Embedding
Similarity
Clustering
Ranking
Anomaly Detection
```

---

## 第三层：LLM

负责复杂语义。

```text
Semantic Classification
Task Understanding
Tag Recommendation
Duplicate Reasoning
Entity Resolution
Natural Language Explanation
```

---

## 第四层：Human Governance

负责最终边界。

```text
Canonical
Merge
Taxonomy
规则
重大变更
争议处理
```

最终：

```text
Rules
  ↓
Algorithms
  ↓
LLM
  ↓
Human
```

---

# 7. 例如“新 Task”到底怎么产生

完整流程可以是：

```text
用户上传 Demo
        ↓
提取 Prompt
        ↓
规则标准化
        ↓
Embedding
        ↓
找到相似 Task
        ↓
没有明显匹配？
        ↓
LLM 判断
        ↓
┌─────────────────┐
│ 建议加入 Task A │
│ 置信度 94%      │
└─────────────────┘
        ↓
管理员确认
        ↓
Task = Canonical
```

这里：

* **算法**负责“找相似”
* **LLM**负责“理解是不是同一个任务”
* **管理员**负责“决定站内最终采用什么”

---

# 8. “AI 推荐”这个词最好在文档里改掉

因为“AI”这个词确实太模糊。

我建议你以后在技术设计里不要写：

> AI 自动推荐标签

而写得具体一点：

> **LLM-assisted Tag Recommendation**

或者：

> **Embedding + LLM Tag Recommendation**

同样：

不要写：

> AI 自动 Task 聚类

而写：

> **Embedding-based Task Retrieval + LLM-assisted Clustering**

这样以后开发人员一看就知道这不是：

```text
“接个 GPT API”
```

这么简单。

---

# 9. 哪些地方我建议用 LLM

| 功能              | LLM | 算法 | 人工 |
| --------------- | --: | -: | -: |
| 标签字符串标准化        |   ❌ |  ✅ |  ❌ |
| Alias 匹配        |   ❌ |  ✅ | 可选 |
| Model 精确匹配      |   ❌ |  ✅ |  ❌ |
| Model 疑似重复判断    |   ✅ |  ✅ |  ✅ |
| Prompt 相似检索     |   ❌ |  ✅ |  ❌ |
| Task 聚类候选       |  辅助 |  ✅ |  ✅ |
| Task 命名         |   ✅ |  ❌ |  ✅ |
| Tag 推荐          |   ✅ |  ✅ | 可选 |
| 技术栈识别           |   ✅ |  ✅ | 可选 |
| Demo 类型识别       |   ✅ |  ✅ | 可选 |
| 重大 Taxonomy 修改  |   ❌ |  ❌ |  ✅ |
| 数据统计            |   ❌ |  ✅ |  ❌ |
| 异常检测            | 可辅助 |  ✅ | 可选 |
| 最终 Canonical 决定 |   ❌ |  ❌ |  ✅ |

这里你可以看到：

> **LLM 并不是整个系统的“大脑”。**

它更像：

> **语义理解引擎。**

---

# 10. 对 deepdemos 来说，最好的架构甚至不是“AI 管理数据库”

而是：

```text
                  Demo
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
      Prompt      Code      Metadata
        │          │          │
        └──────────┼──────────┘
                   ▼
            Feature Extraction
                   │
          ┌────────┴────────┐
          ▼                 ▼
      Algorithm            LLM
          │                 │
          └────────┬────────┘
                   ▼
             Candidate Data
                   │
                   ▼
              Governance
                   │
                   ▼
          Canonical Knowledge
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
      Model       Task       Tags
        │          │          │
        └──────────┼──────────┘
                   ▼
             Explore / Compare
```

这其实比单纯“接一个 LLM”强很多。

---

# 11. 最重要的一点：不要让 LLM 成为数据真相

例如 LLM 说：

> “这个 Demo 使用了 WebGL。”

不能直接：

```text
数据库：
Technology = WebGL
```

最好：

```text
Inference

technology = WebGL
confidence = 0.94
source = llm
status = suggested
```

管理员确认后：

```text
status = verified
```

这样才能长期运营。

---

# 12. 对你这个项目，我甚至建议把“AI”正式改名

在产品文档中统一使用：

### `LLM`

专门指：

> 大语言模型语义理解能力。

### `ML / Algorithm`

专门指：

> Embedding、聚类、相似度、排序、异常检测等算法。

### `Knowledge Engine`

指：

> 两者 + 规则 + 数据库 + 审核系统组成的整体。

所以以后你可以在架构里写：

```text
Knowledge Engine
├── Rule Engine
├── Retrieval / Embedding
├── LLM Service
├── Entity Resolution
├── Recommendation
└── Governance
```

这个命名会比笼统写“AI 模块”专业得多，也更方便以后更换模型供应商。

---

### 我最推荐的最终原则

> **能用规则解决的，不用算法；能用算法解决的，不用 LLM；能让 LLM 给建议的，不让 LLM直接决定；能自动处理的，不交给管理员手工处理。**

最终职责变成：

```text
规则        → 确定性
算法        → 大规模发现
LLM         → 语义理解
管理员      → 知识治理
```

这套分层非常适合 deepdemos，因为随着 Demo 数量增长，**真正需要控制的是 LLM 调用成本、错误传播和知识体系污染**，而不是单纯把“AI 能力”做得越强越好。
