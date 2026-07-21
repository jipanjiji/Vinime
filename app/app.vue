<template>
  <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-[var(--font-sans)] flex flex-col">

    <!-- ===== HEADER ===== -->
    <header class="glass-heavy border-b border-[var(--border-subtle)] sticky top-0 z-50 pt-safe-header" style="padding-top: env(safe-area-inset-top, 24px);">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">

        <!-- Logo -->
        <NuxtLink to="/" class="flex items-center gap-2.5 shrink-0 group">
          <img src="/logo.png" alt="Vinime Logo" class="w-9 h-9 rounded-xl shadow-lg shadow-[var(--accent-glow)] group-hover:scale-105 transition-all duration-300 object-cover" />
          <span class="text-lg font-extrabold text-white tracking-tight hidden sm:block">Vinime</span>
        </NuxtLink>

        <!-- Desktop Nav -->
        <nav class="hidden md:flex items-center gap-1 ml-2">
          <NuxtLink
            to="/"
            class="px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-white/5"
            :class="$route.path === '/' ? 'text-white bg-white/5 font-semibold' : 'text-[var(--text-secondary)]'"
          >Beranda</NuxtLink>

          <NuxtLink
            to="/genres"
            class="px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-white/5"
            :class="$route.path === '/genres' ? 'text-white bg-white/5 font-semibold' : 'text-[var(--text-secondary)]'"
          >Genre</NuxtLink>

          <NuxtLink
            to="/history"
            class="px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-white/5 flex items-center gap-1.5"
            :class="$route.path === '/history' ? 'text-white bg-white/5 font-semibold' : 'text-[var(--text-secondary)]'"
          >
            <span>Riwayat</span>
          </NuxtLink>

          <NuxtLink
            to="/subscribe"
            class="px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-white/5 flex items-center gap-1.5"
            :class="$route.path === '/subscribe' ? 'text-white bg-white/5 font-semibold' : 'text-[var(--text-secondary)]'"
          >
            <span>Subscribe</span>
          </NuxtLink>
        </nav>

        <!-- Search Bar (Desktop & Tablet) -->
        <form @submit.prevent="handleHeaderSearch" class="flex-1 max-w-md hidden md:flex items-center relative ml-4">
          <div class="absolute left-3.5 text-[var(--text-muted)] pointer-events-none">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
          </div>
          <input
            v-model="headerQuery"
            type="text"
            placeholder="Cari anime..."
            class="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-200"
          />
        </form>

        <!-- Mobile Search Button -->
        <NuxtLink to="/search" class="md:hidden p-2 rounded-xl hover:bg-white/5 text-[var(--text-secondary)] hover:text-white transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
        </NuxtLink>
      </div>
    </header>

    <!-- ===== MAIN CONTENT ===== -->
    <main class="flex-1 w-full pb-20 md:pb-0">
      <NuxtPage />
    </main>

    <!-- ===== FOOTER (Desktop) ===== -->
    <footer class="hidden md:block border-t border-[var(--border-subtle)] mt-auto">
      <div class="max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <img src="/logo.png" alt="Vinime Logo" class="w-7 h-7 rounded-lg object-cover" />
          <span class="text-sm font-semibold text-[var(--text-secondary)]">Vinime</span>
        </div>
        <p class="text-xs text-[var(--text-muted)]">© 2026 — Vinime Multi-source anime aggregator</p>
      </div>
    </footer>

    <!-- ===== MOBILE BOTTOM NAV (4 Tabs) ===== -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-heavy border-t border-[var(--border-subtle)] bottom-nav">
      <div class="grid grid-cols-4 h-16 px-1">
        <!-- 1. Home -->
        <NuxtLink to="/" class="flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-colors" :class="$route.path === '/' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>
          <span class="text-[10px] font-semibold">Beranda</span>
        </NuxtLink>

        <!-- 2. Genre -->
        <NuxtLink to="/genres" class="flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-colors" :class="$route.path === '/genres' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg>
          <span class="text-[10px] font-semibold">Genre</span>
        </NuxtLink>

        <!-- 3. Riwayat -->
        <NuxtLink to="/history" class="flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-colors" :class="$route.path === '/history' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
          <span class="text-[10px] font-semibold">Riwayat</span>
        </NuxtLink>

        <!-- 4. Subscribe -->
        <NuxtLink to="/subscribe" class="flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-colors" :class="$route.path === '/subscribe' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"/></svg>
          <span class="text-[10px] font-semibold">Subscribe</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from '#app'
import { App } from '@capacitor/app'

const router = useRouter()
const headerQuery = ref('')

onMounted(() => {
  try {
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        router.back()
      } else {
        App.exitApp()
      }
    })
  } catch {}
})

function handleHeaderSearch() {
  if (headerQuery.value.trim()) {
    router.push({ path: '/search', query: { q: headerQuery.value.trim() } })
    headerQuery.value = ''
  }
}
</script>
