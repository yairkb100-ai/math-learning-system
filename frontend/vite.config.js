import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server on 5173, proxy /api -> backend on 8000 (see CONTRACT.md).
// API_PROXY overrides the target so a second dev stack can run side by side
// with the default one (two ports, two backends) without editing this file.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/api': {
        target: process.env.API_PROXY || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
