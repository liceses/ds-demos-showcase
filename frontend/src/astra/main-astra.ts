// astra 橱窗应用入口：与主站彻底分叉的 mini SPA。
// - 独立路由表：只有 works / work / about 三页，其余路径一律回首页（不存在的路由=不存在的世界）
// - 不调用 auth/PV 打点/心跳（astra 域后端本就 404，省掉无意义请求）
// - funMode 本地强制开：橱窗 origin 的 localStorage 独立，tagLabel 把 ds-unknown 译成 astra-canary；
//   数据面永远由后端按 Host 收敛，这里只是显示层。
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import AstraRoot from './AstraRoot.vue'
import { funMode } from '../utils/funMode'
import { lang, setLang } from '../i18n'
import './astra.css'

const BRAND = 'astra canary collection'

export function mountAstraApp() {
  funMode.value = true
  try {
    localStorage.setItem('dsh_fun_mode', '1')
  } catch {
    /* 隐私模式等写入失败无碍 */
  }
  if (lang.value !== 'en') setLang('en')

  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', name: 'works', component: () => import('./AstraWorksView.vue') },
      { path: '/demo/:slug', name: 'work', component: () => import('./AstraWorkView.vue'), props: true },
      { path: '/about', name: 'about', component: () => import('./AstraAboutView.vue') },
      { path: '/:pathMatch(.*)*', name: 'home-redirect', redirect: '/' },
    ],
    scrollBehavior(_to, _from, saved) {
      return saved ?? { top: 0 }
    },
  })

  router.afterEach((to) => {
    document.title = to.name === 'works' ? BRAND : `${String(to.name)} · ${BRAND}`
  })

  document.documentElement.lang = 'en'
  createApp(AstraRoot).use(router).mount('#app')
}
