// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: {
    enabled: false,
  },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Vinime — Nonton Anime Sub Indo',
      meta: [
        { name: 'description', content: 'Nonton anime subtitle Indonesia gratis tanpa iklan. Multi-source streaming dari berbagai sumber terpercaya.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#06060e' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800&display=swap' },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },
  vite: {
    optimizeDeps: {
      include: ['hls.js']
    }
  }
})