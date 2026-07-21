import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    const isCapacitor = window.location.protocol === 'capacitor:' ||
                        window.location.hostname === 'localhost' ||
                        window.location.hostname === '127.0.0.1';

    if (isCapacitor) {
      const originalFetch = globalThis.$fetch
      globalThis.$fetch = (async (request: any, opts: any = {}) => {
        if (typeof request === 'string' && request.startsWith('/api/')) {
          const customUrl = localStorage.getItem('vnime_backend_url')
          const baseUrl = customUrl || 'https://vinime.vercel.app'
          request = `${baseUrl.replace(/\/$/, '')}${request}`
        }
        return originalFetch(request, opts)
      }) as typeof originalFetch

      Object.assign(globalThis.$fetch, originalFetch)
    }
  }
})
