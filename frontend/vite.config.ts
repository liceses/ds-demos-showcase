import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发代理目标：默认 localhost:8000（./start-dev.ps1 的正常路径）。
// 需要另起一套后端实例（例如挂真实规模仿真库做验收演示）时，用环境变量覆盖：
//   $env:VITE_DEV_API_TARGET='http://127.0.0.1:8180'; vite --port 5180 --strictPort
const API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
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
})
