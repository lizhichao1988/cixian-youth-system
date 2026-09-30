import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 相对路径：构建产物可放在任意子路径或同源托管，
  // 不依赖固定域名。配合后端单服务部署时尤其重要。
  base: './',
  plugins: [react()],
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