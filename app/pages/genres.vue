<script setup>
import { ref, onMounted } from 'vue'

const genresList = ref([])
const activeGenre = ref(null)
const animeList = ref([])
const isLoadingList = ref(true)
const isLoadingAnime = ref(false)
const errorMsg = ref('')

onMounted(async () => {
  await loadGenres()
})

import { fetchClientGenres } from '~/utils/clientScraper'

async function loadGenres() {
  isLoadingList.value = true
  errorMsg.value = ''
  try {
    const data = await $fetch('/api/genres').catch(() => null)
    if (data?.success && data.genres?.length > 0) {
      genresList.value = data.genres
      if (data.genres.length > 0) {
        await selectGenre(data.genres[0].slug)
      }
      return
    }

    const clientData = await fetchClientGenres()
    if (clientData?.success) {
      genresList.value = clientData.genres
      if (clientData.genres.length > 0) {
        await selectGenre(clientData.genres[0].slug)
      }
    } else {
      errorMsg.value = 'Gagal memuat daftar genre.'
    }
  } catch (err) {
    errorMsg.value = err.message || 'Koneksi ke server gagal.'
  } finally {
    isLoadingList.value = false
  }
}

async function selectGenre(slug) {
  activeGenre.value = slug
  isLoadingAnime.value = true
  errorMsg.value = ''
  animeList.value = []
  try {
    const data = await $fetch(`/api/genres?genre=${encodeURIComponent(slug)}`).catch(() => null)
    if (data?.success && data.animeList?.length > 0) {
      animeList.value = data.animeList
      return
    }

    const clientData = await fetchClientGenres(slug)
    if (clientData?.success) {
      animeList.value = clientData.animeList
    } else {
      errorMsg.value = 'Gagal memuat anime genre ini.'
    }
  } catch (err) {
    errorMsg.value = err.message || 'Gagal terhubung ke server.'
  } finally {
    isLoadingAnime.value = false
  }
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">

    <!-- Header -->
    <div class="space-y-2 anim-fade-up">
      <h1 class="text-2xl sm:text-3xl font-extrabold text-white">Genre Anime</h1>
      <p class="text-sm text-[var(--text-secondary)] max-w-lg">Jelajahi katalog anime berdasarkan genre favorit Anda</p>
    </div>

    <!-- Error Block -->
    <div v-if="errorMsg" class="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm anim-scale-in">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>
        {{ errorMsg }}
      </div>
    </div>

    <!-- Genre Pills (horizontal scroll on mobile, wrap on desktop) -->
    <div class="space-y-3 anim-fade-up anim-delay-1">
      <!-- Loading Genres -->
      <div v-if="isLoadingList" class="flex gap-2 overflow-x-auto scroll-hidden pb-2">
        <div v-for="i in 12" :key="i" class="skeleton h-9 w-20 rounded-xl shrink-0"></div>
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <button
          v-for="g in genresList"
          :key="g.slug"
          @click="selectGenre(g.slug)"
          class="px-4 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 active:scale-95"
          :class="activeGenre === g.slug
            ? 'bg-[var(--accent)]/15 border-[var(--accent)]/50 text-[var(--accent)] shadow-lg shadow-[var(--accent-glow)]'
            : 'border-[var(--border-subtle)] hover:border-[var(--border-hover)] bg-[var(--bg-card)]/50 text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-card)]'"
        >{{ g.name }}</button>
      </div>
    </div>

    <!-- Results Section -->
    <div class="space-y-4 anim-fade-up anim-delay-2">
      <!-- Section header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-1 h-5 rounded-full bg-gradient-to-b from-[var(--accent)] to-purple-600"></div>
          <h2 class="text-sm font-bold text-white">
            <span v-if="activeGenre">{{ genresList.find(g => g.slug === activeGenre)?.name }}</span>
            <span v-else>Pilih Genre</span>
          </h2>
        </div>
        <span v-if="!isLoadingAnime && activeGenre" class="text-xs text-[var(--text-muted)] font-medium">{{ animeList.length }} anime</span>
      </div>

      <!-- Loading Anime Grid -->
      <div v-if="isLoadingAnime" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        <div v-for="i in 10" :key="i" class="space-y-2.5">
          <div class="skeleton aspect-[3/4] rounded-xl"></div>
          <div class="skeleton h-3 w-3/4 rounded"></div>
          <div class="skeleton h-2.5 w-1/2 rounded"></div>
        </div>
      </div>

      <!-- Empty Results -->
      <div v-else-if="activeGenre && animeList.length === 0" class="text-center py-16 anim-fade-up">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] mb-3">
          <svg class="w-6 h-6 text-[var(--text-muted)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z"/></svg>
        </div>
        <p class="text-sm text-[var(--text-secondary)] font-medium">Tidak ada anime ditemukan</p>
      </div>

      <!-- Results Grid -->
      <div v-else-if="animeList.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        <NuxtLink
          v-for="(anime, idx) in animeList"
          :key="anime.slug"
          :to="`/anime/${anime.slug}`"
          class="group anim-fade-up"
          :style="{ animationDelay: `${idx * 0.03}s` }"
        >
          <div class="relative rounded-xl overflow-hidden aspect-[3/4] bg-[var(--bg-card)] border border-[var(--border-subtle)] card-hover card-glow">
            <img :src="anime.cover" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>

            <!-- Rating Badge -->
            <div class="absolute top-2 left-2">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-amber-400 text-[10px] font-bold">
                ⭐ {{ anime.rating || '—' }}
              </span>
            </div>

            <!-- Type Badge -->
            <div class="absolute bottom-2 right-2">
              <span v-if="anime.type" class="px-1.5 py-0.5 rounded-md bg-[var(--accent)]/30 backdrop-blur-sm text-[var(--accent-hover)] text-[9px] font-bold uppercase">
                {{ anime.type }}
              </span>
            </div>
          </div>

          <p class="text-xs text-[var(--text-secondary)] mt-2 line-clamp-2 group-hover:text-white transition-colors font-semibold leading-relaxed">{{ anime.title }}</p>
        </NuxtLink>
      </div>
    </div>

  </div>
</template>
