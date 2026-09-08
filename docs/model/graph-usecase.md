# 用例图（Use Case · CIM 视角）

<!-- 由 dsh-project-model 用例图渲染生成，勿手改；数据源 docs/model/usecase.json -->

```mermaid
graph LR
    actor:visitor["访客"]:::actor
    actor:user["登录用户"]:::actor
    actor:admin["管理员"]:::actor
    actor:agent["AI 自动上传助手"]:::actor
    uc:browse-demos("浏览与搜索作品")
    uc:preview-demo("预览与试玩作品")
    uc:upload-demo("上传演示作品")
    uc:agent-upload("AI 自动上传作品")
    uc:suggest-tag("申请新标签值")
    uc:propose-task("提议新题目")
    uc:challenge-task("挑战已有题目")
    uc:rate-demo("评分作品")
    uc:view-ranking("查看排行榜")
    uc:browse-models("浏览模型")
    uc:browse-tasks("浏览题目与同题对比")
    uc:explore-tags("探索标签")
    uc:forum-talk("发帖与回帖")
    uc:follow-user("关注用户与接收通知")
    uc:register-login("注册登录")
    uc:admin-entity("管理实体知识")
    uc:admin-inbox("消化知识候选")
    uc:admin-govern("治理词表与实体身份")
    uc:admin-moderate("审核内容与社区")
    uc:admin-site("站点配置与审计")
    actor:visitor --> uc:browse-demos
    actor:visitor --> uc:preview-demo
    actor:visitor --> uc:upload-demo
    actor:user --> uc:upload-demo
    actor:agent --> uc:agent-upload
    actor:user --> uc:suggest-tag
    actor:user --> uc:propose-task
    actor:user --> uc:challenge-task
    actor:visitor --> uc:rate-demo
    actor:user --> uc:rate-demo
    actor:visitor --> uc:view-ranking
    actor:visitor --> uc:browse-models
    actor:visitor --> uc:browse-tasks
    actor:visitor --> uc:explore-tags
    actor:user --> uc:forum-talk
    actor:user --> uc:follow-user
    actor:visitor --> uc:register-login
    actor:admin --> uc:admin-entity
    actor:admin --> uc:admin-inbox
    actor:admin --> uc:admin-govern
    actor:admin --> uc:admin-moderate
    actor:admin --> uc:admin-site
    classDef actor fill:#ffd93d,stroke:#141414,stroke-width:2px
```

## 图例
- 黄色火柴人 = 主要参与者（访客 / 登录用户 / 管理员 / AI 上传助手）
- 椭圆 = 用例（用户视角的动宾短语，讲 What 不讲 How）
- 实线 = 已确认（approved）；虚线 = 草案（draft，待用户在项目模型视图确认）

共 24 节点（4 actor + 20 用例）、22 条关联。
