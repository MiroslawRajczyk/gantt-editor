import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // frappe-gantt's exports map doesn't expose the CSS sub-path, so we
      // bypass it with a direct alias to the dist file.
      'frappe-gantt-css': path.resolve(
        __dirname,
        'node_modules/frappe-gantt/dist/frappe-gantt.css',
      ),
    },
  },
})
