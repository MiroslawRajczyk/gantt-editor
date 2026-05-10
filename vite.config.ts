import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'frappe-gantt': path.resolve(__dirname, 'src/lib/frappe-gantt/index.js'),
    },
  },
  server: {
    proxy: {
      '/clickup': {
        target: 'https://api.clickup.com/api/v2',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/clickup/, ''),
      },
    },
  },
})
