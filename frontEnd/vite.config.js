import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Doğru cache-control başlıkları (bayat UI'ı önlemek için):
 *  - index.html / gezinme → no-cache: tarayıcı her zaman güncel HTML'i doğrular,
 *    böylece her zaman güncel hash'li bundle'ları yükler.
 *  - /assets/* (hash'li) → immutable + 1 yıl: içerik-adresli, asla değişmez.
 * Hem dev hem `vite preview` (dist'i sunan) sunucusunda uygulanır.
 */
const cacheHeaders = () => {
  const apply = (server) => {
    server.middlewares.use((req, res, next) => {
      const url = (req.url || '').split('?')[0]
      if (url.startsWith('/assets/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else if (url === '/' || url === '/index.html' || url.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
      next()
    })
  }
  return {
    name: 'cache-control-headers',
    configureServer: apply,
    configurePreviewServer: apply,
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cacheHeaders()],
})
