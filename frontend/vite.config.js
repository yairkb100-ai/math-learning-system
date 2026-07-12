import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server on 5173, proxy /api -> backend on 8000 (see CONTRACT.md)
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
