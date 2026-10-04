import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 相对路径：构建产物可放在任意子路径或同源托管，
  // 不依赖固定域名。配合后端单服务部署时尤其重要。
  base: './',
  plugins: [react()],
  build: {
    /**
     * 代码分包。
     *
     * 优化前：所有东西打进一个 1.9MB 的 js，
     * 乡镇网络首屏要等很久，而且改一行代码
     * 用户就得重新下载整个 1.9MB。
     *
     * 优化后：按依赖拆开，
     * antd / echarts / react 这些长期不变的部分
     * 会被浏览器长期缓存，
     * 日常更新只需要重新下载业务代码那一份。
     */
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (
            id.includes('echarts') ||
            id.includes('zrender')
          ) {
            return 'echarts'
          }

          if (
            id.includes('antd') ||
            id.includes('@ant-design') ||
            id.includes('rc-')
          ) {
            return 'antd'
          }

          if (
            id.includes('react') ||
            id.includes('scheduler')
          ) {
            return 'react'
          }

          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
});