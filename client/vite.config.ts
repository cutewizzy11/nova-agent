import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const demoKey = env.DEMO_API_KEY

  return {
    plugins: [react()],
    server: {
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          headers: demoKey ? { 'x-demo-api-key': demoKey } : {},
        },
      },
    },
  }
})
