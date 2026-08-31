import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import { isAstraSite } from './astra/scope'

// 双域名分叉（docs/astra橱窗分离.md）：
// astrademos.top → 极简橱窗 mini-SPA（main-astra 独立路由/壳层，主站 App/router 代码不加载）；
// 其余域名（deepdemos.top 等）→ 主站原路径，样式基座两边共用，astra.css 以更高特异度覆盖。
if (isAstraSite()) {
  import('./astra/main-astra').then(({ mountAstraApp }) => mountAstraApp())
} else {
  void (async () => {
    const [{ default: App }, { default: router }] = await Promise.all([import('./App.vue'), import('./router')])
    const app = createApp(App)
    app.use(createPinia())
    app.use(router)
    app.mount('#app')
  })()
}
