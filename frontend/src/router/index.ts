import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { useAuthStore } from '../stores/auth'
import { api } from '../api'
import { titleBase } from '../utils/funMode'
import { routeTitle } from '../i18n'

const router = createRouter({
  history: createWebHistory(),
    routes,
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
