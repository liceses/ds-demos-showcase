# web 层（PIM）

<!-- 由 dsh-project-model render-mermaid 生成，勿手改；数据源见注释 -->

```mermaid
flowchart TD
    routers["routers 包"]
    routers_admin["Admin 路由"]
    routers_admin_entities["Admin 实体路由"]
    routers_announcements["公告路由"]
    routers_auth["认证路由"]
    routers_comments["评论路由"]
    routers_demos["Demos 路由"]
    routers_explore["探索路由"]
    routers_forum["论坛路由"]
    routers_meta["Meta 路由"]
    routers_models["模型路由"]
    routers_notifications["通知路由"]
    routers_peek["Peek 路由"]
    routers_ratings["评分路由"]
    routers_sessions["会话路由"]
    routers_stats["统计路由"]
    routers_tags["标签路由"]
    routers_tasks["任务路由"]
    routers_users["用户路由"]
```

<!-- 跨层依赖：→application:64，→domain:46，→infrastructure:47 -->

