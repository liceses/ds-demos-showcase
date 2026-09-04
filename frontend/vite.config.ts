import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发代理目标：默认 localhost:8000（./start-dev.ps1 的正常路径）。
// 需要另起一套后端实例（例如挂真实规模仿真库做验收演示）时，用环境变量覆盖：
//   $env:VITE_DEV_API_TARGET='http://127.0.0.1:8180'; vite --port 5180 --strictPort
const API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // build 段（04 §5.1 最小必要配置）：目标 es2020；生产关 sourcemap；300KB 阈值；
  // manualChunks 两桶：markdown 库（marked+dompurify，懒加载页才用）与 app 其余 vendor 合桶减请求
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 300,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('marked') || id.includes('dompurify')) return 'vendor-markdown'
          return 'vendor-app'
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    // Vite 6+ 默认拒绝非 localhost 的 Host 头（403 blocked host）：本地橱窗预览域名放行
    allowedHosts: ['astrademos.top', '.astrademos.top'],
    // changeOrigin:false —— 保留原始 Host 头转发给后端，这样本地按域名分视区才生效：
    // hosts 里加 `127.0.0.1 astrademos.top` 后访问 http://astrademos.top:5173 → 后端 Host=astrademos.top
    // → 进入 astra 橱窗视区（数据面同源收敛）；访问 http://localhost:5173 仍是主站 deep 视区。
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: false,
      },
      '/preview': {
        target: API_TARGET,
        changeOrigin: false,
      },
      '/media': {
        target: API_TARGET,
        changeOrigin: false,
      },
    },
  },
  // preview：让 `vite preview` 也能跑构建产物（否则 /api 404，
  // 发布前就无法用 dist 验证 —— 而 dev server 跑的源码与线上产物不是同一份东西）
  preview: {
    host: true,
    port: 5199,
    allowedHosts: ['astrademos.top', '.astrademos.top'],
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/preview': { target: API_TARGET, changeOrigin: false },
      '/media': { target: API_TARGET, changeOrigin: false },
    },
  },
})
