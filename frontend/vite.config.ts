import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    // changeOrigin:false —— 保留原始 Host 头转发给后端，这样本地按域名分视区才生效：
    // hosts 里加 `127.0.0.1 astrademos.top` 后访问 http://astrademos.top:5173 → 后端 Host=astrademos.top
    // → 进入 astra 橱窗视区（数据面同源收敛）；访问 http://localhost:5173 仍是主站 deep 视区。
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: false,
      },
      '/preview': {
        target: 'http://localhost:8000',
        changeOrigin: false,
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: false,
      },
    },
  },
})
