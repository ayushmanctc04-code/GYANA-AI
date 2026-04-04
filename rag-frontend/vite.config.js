import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/upload':       { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ask':          { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/speech-query': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/stats':        { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/documents':    { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('react-dom') || id.includes('react/jsx-runtime') || id.includes('react')) {
            return 'react-vendor'
          }
          return 'vendor'
        },
      },
    },
  },
})
