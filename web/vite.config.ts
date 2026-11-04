import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// In dev, /api is proxied to the Express server; in production Express serves this build itself (one origin).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5080' },
  },
  build: { chunkSizeWarningLimit: 1200 },
})
