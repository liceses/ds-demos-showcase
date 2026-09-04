import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../api'
import { titleBase } from '../utils/funMode'
import { routeTitle } from '../i18n'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), meta: { title: '首页', keepAlive: true } },
    { path: '/about', name: 'about', component: () => import('../views/AboutView.vue'), meta: { title: '关于本站' } },
    { path: '/demos', name: 'demos', component: () => import('../views/DemosView.vue'), meta: { title: '作品库', keepAlive: true } },
    { path: '/leaderboard', name: 'leaderboard', component: () => import('../views/LeaderboardView.vue'), meta: { title: '排行榜', keepAlive: true } },
    { path: '/forum', name: 'forum', component: () => import('../views/ForumListView.vue'), meta: { title: '讨论区', forum: true, keepAlive: true } },
    { path: '/forum/topic/:id', name: 'forum-topic', component: () => import('../views/ForumTopicView.vue'), props: true, meta: { title: '主题', forum: true } },
    { path: '/forum/new', name: 'forum-new', component: () => import('../views/ForumNewView.vue'), meta: { title: '发帖', forum: true, requiresAuth: true } },
    { path: '/demo/:slug', name: 'demo', component: () => import('../views/DemoView.vue'), props: true, meta: { title: 'Demo' } },
    { path: '/models', name: 'models', component: () => import('../views/ModelsView.vue'), meta: { title: '模型', keepAlive: true } },
    { path: '/models/:slug', name: 'model-detail', component: () => import('../views/ModelDetailView.vue'), props: true, meta: { title: '模型' } },
    { path: '/tasks', name: 'tasks', component: () => import('../views/TasksView.vue'), meta: { title: '题目', keepAlive: true } },
    { path: '/tasks/:slug', name: 'task-detail', component: () => import('../views/TaskDetailView.vue'), props: true, meta: { title: '题目' } },
    // v2 D3：/tags 原地升级为「探索」（URL 不变保外链兼容），旧的键浏览页下移到 /tags/keys
    { path: '/tags', name: 'explore', component: () => import('../views/ExploreView.vue'), meta: { title: '探索', keepAlive: true } },
    { path: '/tags/keys', name: 'tag-keys', component: () => import('../views/TagListView.vue'), meta: { title: '标签', keepAlive: true } },
    { path: '/tag/:k/:v', name: 'tag-detail', component: () => import('../views/TagDetailView.vue'), props: true, meta: { title: '标签详情' } },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { title: '登录' } },
    { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue'), meta: { title: '注册' } },
    { path: '/user/:username', name: 'user', component: () => import('../views/UserView.vue'), props: true, meta: { title: '用户' } },
    { path: '/author/public', name: 'public-author', component: () => import('../views/PublicView.vue'), meta: { title: '公开用户' } },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '账户设置', requiresAuth: true } },
    { path: '/notifications', name: 'notifications', component: () => import('../views/NotificationsView.vue'), meta: { title: '通知', requiresAuth: true } },
    { path: '/upload', name: 'upload', component: () => import('../views/UploadView.vue'), meta: { title: '上传 Demo', remountOnQuery: true } },
    { path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue'), meta: { title: '管理后台', requiresAuth: true, requiresAdmin: true } },
    // 赞助/致谢已并入管理后台面板；旧地址保留重定向（书签与外链不该突然死）
    { path: '/admin/sponsors', redirect: { path: '/admin', query: { tab: 'sponsors' } } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: '404' } },
  ],
  scrollBehavior(to, from, savedPosition) {
    // 浏览器返回/前进时恢复滚动位置
    if (savedPosition) return savedPosition
    // 同一路由只改 query（排序 / 筛选 / 分页 / 加载更多）绝不回顶部：
    // 那会让「再显示 24 件」看起来毫无反应（实测症状），也会打断阅读位置。
    if (to.path === from.path) return false
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (auth.user === null) {
    await auth.fetchMe()
  }
  if (to.meta.requiresAuth && !auth.isLoggedIn()) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !auth.isAdmin()) {
    return { path: '/' }
  }
  return true
})

router.afterEach((to) => {
  // 页面标题随语言切换（routeTitle 映射）+ 站点名随 fun/i18n 切换（titleBase）
  const pageTitle = to.meta.title ? routeTitle(String(to.meta.title)) : ''
  document.title = pageTitle ? `${pageTitle} · ${titleBase.value}` : titleBase.value
  // 页面访问打点：一次路由切换 = 一次浏览（原始 PV +1）
  api.reportVisit()
})

// 实时在线心跳：每 30s 发一次（模块级，单页一次）。
// 后台标签页停发（visibilityState 判定）：休眠窗口不打点，避免无意义请求与失真在线数（P0-3）；
// 回到前台立即补一拍——上次心跳可能已是 30s+ 之前，消除休眠间隙。
setInterval(() => {
  if (document.visibilityState === 'visible') api.reportHeartbeat()
}, 30_000)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') api.reportHeartbeat()
})

export default router
