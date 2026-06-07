import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // dev에서 API는 로컬 Fastify(npm start, 8080)로 프록시 — 쿠키 same-origin 유지
    proxy: { '/api': 'http://localhost:8080' },
  },
})
