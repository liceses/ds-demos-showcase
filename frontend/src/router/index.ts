import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../api'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), meta: { title: '首页' } },
    { path: '/about', name: 'about', component: () => import('../views/AboutView.vue'), meta: { title: '关于本站' } },
    { path: '/demos', name: 'demos', component: () => import('../views/DemosView.vue'), meta: { title: '作品库' } },
    { path: '/leaderboard', name: 'leaderboard', component: () => import('../views/LeaderboardView.vue'), meta: { title: '排行榜' } },
    { path: '/demo/:slug', name: 'demo', component: () => import('../views/DemoView.vue'), props: true, meta: { title: 'Demo' } },
    { path: '/tags', name: 'tags', component: () => import('../views/TagListView.vue'), meta: { title: '标签' } },
    { path: '/tag/:k/:v', name: 'tag-detail', component: () => import('../views/TagDetailView.vue'), props: true, meta: { title: '标签详情' } },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { title: '登录' } },
    { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue'), meta: { title: '注册' } },
    { path: '/user/:username', name: 'user', component: () => import('../views/UserView.vue'), props: true, meta: { title: '用户' } },
    { path: '/author/public', name: 'public-author', component: () => import('../views/PublicView.vue'), meta: { title: '公开用户' } },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: '账户设置', requiresAuth: true } },
    { path: '/upload', name: 'upload', component: () => import('../views/UploadView.vue'), meta: { title: '上传 Demo' } },
    { path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue'), meta: { title: '管理后台', requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/sponsors', name: 'admin-recognition', component: () => import('../views/RecognitionAdminView.vue'), meta: { title: '赞助/致谢管理', requiresAuth: true, requiresAdmin: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: '404' } },
  ],
  scrollBehavior() {
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
  const base = 'AI 全民制作人'
  document.title = to.meta.title ? `${String(to.meta.title)} · ${base}` : base
  // 页面访问打点：一次路由切换 = 一次浏览（原始 PV +1）
  api.reportVisit()
})

export default router
