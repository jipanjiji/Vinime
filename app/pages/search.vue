<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from '#app'

const route = useRoute()
const router = useRouter()

const query = ref('')
const searchLoading = ref(false)
const searchResults = ref([])
const errorMsg = ref('')
const hasSearched = ref(false)

onMounted(async () => {
  query.value = (route.query.q || '').toString()
  if (query.value.trim()) {
    await performSearch()
  }
})

watch(
  () => route.query.q,
  async (newQ) => {
    query.value = (newQ || '').toString()
    if (query.value.trim()) {
      await performSearch()
    }
  }
)

import { fetchClientSearch } from '~/utils/clientScraper'

async function performSearch() {
  if (!query.value.trim()) {
    searchResults.value = []
    searchLoading.value = false
    return
  }
  searchLoading.value = true
  hasSearched.value = true
  errorMsg.value = ''
  try {
    const data = await $fetch(`/api/search?q=${encodeURIComponent(query.value)}`).catch(() => null)
    if (data?.success && data.results?.length > 0) {
      searchResults.value = data.results
      return
    }

    const clientData = await fetchClientSearch(query.value)
    if (clientData?.success) {
      searchResults.value = clientData.results
    } else {
      errorMsg.value = 'Pencarian tidak ditemukan.'
    }
  } catch (err) {
    errorMsg.value = err.message || 'Terjadi kesalahan.'
  } finally {
    searchLoading.value = false
  }
}

function handleSearch() {
  if (query.value.trim()) {
    router.push({ path: '/search', query: { q: query.value.trim() } })
  }
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">

    <!-- Search Header -->
    <div class="max-w-2xl mx-auto text-center space-y-6 anim-fade-up">
      <div class="space-y-2">
        <h1 class="text-2xl sm:text-3xl font-extrabold text-white">Cari Anime</h1>
        <p class="text-sm text-[var(--text-secondary)]">Temukan anime favorit dari katalog lengkap kami</p>
      </div>

      <!-- Search Form -->
      <form @submit.prevent="handleSearch" class="flex gap-2.5 max-w-lg mx-auto">
        <div class="relative flex-1">
          <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
            <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
          </div>
          <input
            v-model="query"
            type="text"
            placeholder="Ketik judul anime..."
            class="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-200"
            autofocus
          />
        </div>
        <button type="submit" class="px-6 py-3 bg-gradient-to-r from-[var(--accent)] to-purple-600 hover:from-[var(--accent-hover)] hover:to-purple-500 text-white text-sm font-bold rounded-xl transition-all duration-200 shadow-lg shadow-[var(--accent-glow)] active:scale-95">Cari</button>
      </form>
    </div>

    <!-- Result Count -->
    <div v-if="hasSearched && !searchLoading" class="anim-fade-up anim-delay-1">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-[var(--text-secondary)]">
          Hasil untuk <span class="text-white font-bold">"{{ query }}"</span>
        </h2>
        <span class="text-xs text-[var(--text-muted)] font-medium">{{ searchResults.length }} anime</span>
      </div>
    </div>

    <!-- Error -->
    <div v-if="errorMsg" class="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm anim-scale-in">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>
        {{ errorMsg }}
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="searchLoading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <div v-for="i in 10" :key="i" class="space-y-2.5">
        <div class="skeleton aspect-[3/4] rounded-xl"></div>
        <div class="skeleton h-3 w-3/4 rounded"></div>
        <div class="skeleton h-2.5 w-1/2 rounded"></div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="hasSearched && searchResults.length === 0 && !errorMsg" class="text-center py-20 anim-fade-up">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] mb-4">
        <svg class="w-7 h-7 text-[var(--text-muted)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"/></svg>
      </div>
      <p class="text-[var(--text-secondary)] text-sm font-medium">Tidak ada hasil ditemukan</p>
      <p class="text-[var(--text-muted)] text-xs mt-1">Coba kata kunci lain atau periksa ejaan</p>
    </div>

    <!-- Results Grid -->
    <div v-else-if="searchResults.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
      <NuxtLink
        v-for="(anime, idx) in searchResults"
        :key="anime.slug"
        :to="`/anime/${anime.slug}`"
        class="group anim-fade-up"
        :style="{ animationDelay: `${idx * 0.04}s` }"
      >
        <div class="relative rounded-xl overflow-hidden aspect-[3/4] bg-[var(--bg-card)] border border-[var(--border-subtle)] card-hover card-glow">
          <img :src="anime.cover" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>

          <!-- Score Badge -->
          <div class="absolute top-2 left-2">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-amber-400 text-[10px] font-bold">
              ⭐ {{ anime.score || '—' }}
            </span>
          </div>

          <!-- Status + Type -->
          <div v-if="anime.status" class="absolute top-2 right-2 flex flex-col gap-1 items-end">
            <span
              class="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase backdrop-blur-sm"
              :class="anime.status?.toLowerCase().includes('ongoing')
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-emerald-500/20 text-emerald-400'"
            >{{ anime.status }}</span>
          </div>

          <!-- Bottom Info -->
          <div class="absolute bottom-0 inset-x-0 p-2.5">
            <span v-if="anime.type" class="text-[9px] font-semibold text-white/50 uppercase">{{ anime.type }}</span>
          </div>
        </div>

        <div class="mt-2 space-y-1">
          <p class="text-xs text-[var(--text-secondary)] group-hover:text-white transition-colors font-semibold line-clamp-2 leading-relaxed">{{ anime.title }}</p>
          <div class="flex flex-wrap gap-1">
            <span v-for="g in anime.genres?.slice(0, 2)" :key="g" class="text-[9px] px-1.5 py-0.5 rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)] font-medium">{{ g }}</span>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Initial State (no search yet) -->
    <div v-if="!hasSearched && !searchLoading" class="text-center py-16 anim-fade-up anim-delay-2">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] mb-4">
        <svg class="w-7 h-7 text-[var(--accent)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
      </div>
      <p class="text-[var(--text-secondary)] text-sm font-medium">Ketik judul anime untuk mulai mencari</p>
    </div>

  </div>
</template>
