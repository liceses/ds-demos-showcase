import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { isAstraSite } from './astra/scope'

// 双域名分叉（docs/astra橱窗分离.md）：
// astrademos.top → 极简橱窗 mini-SPA（main-astra 独立路由/壳层，主站 App/router 代码不加载）；
// 其余域名（deepdemos.top 等）→ 主站原路径，astra.css 以更高特异度覆盖。
// P1-4 astra 卸载（04 §5.5）：主站 styles/ 改入主站分支动态加载——
// astra 视区不再背主站样式（原 108KB 级），41/41 ax-* 类隔离结论不受影响（astra.css 自足）。
if (isAstraSite()) {
  import('./astra/main-astra').then(({ mountAstraApp }) => mountAstraApp())
} else {
  void (async () => {
    await import('./styles/index.css') // 样式先行于壳层渲染（FOUC 由 index.html 头部内联置 data-theme 兜底）
    const [{ default: App }, { default: router }] = await Promise.all([import('./App.vue'), import('./router')])
    const app = createApp(App)
    app.use(createPinia())
    app.use(router)
    app.mount('#app')
  })()
}
