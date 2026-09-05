import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { isAstraSite } from './astra/scope'
import { lang, loadEn } from './i18n'

// 双域名分叉（docs/astra橱窗分离.md）：
// astrademos.top → 极简橱窗 mini-SPA（main-astra 独立路由/壳层，主站 App/router 代码不加载）；
// 其余域名（deepdemos.top 等）→ 主站原路径，astra.css 以更高特异度覆盖。
// P1-4 astra 卸载（04 §5.5）：主站 styles/ 改入主站分支动态加载——
// astra 视区不再背主站样式（原 108KB 级），41/41 ax-* 类隔离结论不受影响（astra.css 自足）。
if (isAstraSite()) {
  import('./astra/main-astra').then(({ mountAstraApp }) => mountAstraApp())
} else {
  void (async () => {
    // 英文用户：词表就绪再挂载（04 §5.3，P2-2），避免首帧中文回落闪帧；加载失败不阻塞（t() 回落中文）
    if (lang.value === 'en') await loadEn().catch(() => undefined)
    const interWoff2 = (await import('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url')).default
    // preload 标题字体（04 §2.4）：运行时注入（vite 哈希 URL 由 import 取得）
    const pre = document.createElement('link')
    pre.rel = 'preload'
    pre.as = 'font'
    pre.type = 'font/woff2'
    pre.crossOrigin = ''
    pre.href = interWoff2
    document.head.appendChild(pre)
    await import('./styles/fonts.css')
    await import('./styles/index.css') // 样式先行于壳层渲染（FOUC 由 index.html 头部内联置 data-theme 兜底）
    const [{ default: App }, { default: router }] = await Promise.all([import('./App.vue'), import('./router')])
    const app = createApp(App)
    app.use(createPinia())
    app.use(router)
    app.mount('#app')
  })()
}
