我想要构建一个网站用来展示各种ai模型做出的网页demo
1. 要做一个内容瀑布流的主页,展示demo的封面 推荐分多栏 , 
2. 每一个demo都有单独的展示页(demo,tags,信息,评论等)
3. 需要有标签(键值对)系统给demos 方便 区分比较 标签(tags)需要支持自定义.tags也需要有自身信息的介绍 , tags之间有层级关系
4. 可以根据标签查找 demos 
5. 每个demo都会伴随着 一个或多个session log 文件记录生成这个demo的会话
6. 建议给每个demo都加上git版本控制系统 , 方便后序完善 也展示 ai生成这个demo的过程
7. 部署到 Cloudflare 全托管(Pages+Workers+D1+R2), 保留可迁移到云服务器的架构, 做成方便部署的版本
8. 需要 用户/登录/评论 系统 ,demos作者等信息以附加tag的形式添加到demos的信息中.
9. 需要具有优良扩展性的底层架构.
10. 可以先生成一些 占位 demos  来看效果
11. 初始 tags : model:*（97 个常见值，2026-08 更新，按厂商分组）、plugin:routing-suite、skills:J-space、preset:router-standard、type:*、category:*
12. 支持demos 的上传下载功能. 自动限制流量
13. ui完全参考https://dsgames.askhow.top/这个网站, 其他设计也可以参照.
todo:
1. 支持gh登录
2. demos的gh仓库 一步迁移到本站