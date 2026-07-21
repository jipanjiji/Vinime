<script setup>
import { ref, onMounted } from 'vue'
import { getSubscriptions, toggleSubscription } from '~/utils/storage'

const subItems = ref([])

onMounted(() => {
  loadSubs()
})

function loadSubs() {
  subItems.value = getSubscriptions()
}

function handleUnsub(anime) {
  toggleSubscription(anime)
  loadSubs()
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">

    <!-- Header -->
    <div class="space-y-1 anim-fade-up">
      <h1 class="text-2xl sm:text-3xl font-extrabold text-white">Anime Subscribed</h1>
      <p class="text-sm text-[var(--text-secondary)]">Koleksi anime yang Anda tandai untuk ditonton</p>
    </div>

    <!-- Empty State -->
    <div v-if="subItems.length === 0" class="text-center py-20 anim-fade-up">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] mb-4">
        <svg class="w-7 h-7 text-[var(--text-muted)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"/></svg>
      </div>
      <p class="text-[var(--text-secondary)] text-sm font-medium">Belum ada anime yang di-subscribe</p>
      <p class="text-[var(--text-muted)] text-xs mt-1">Tekan tombol "Subscribe" pada halaman anime untuk menambahkannya di sini</p>
      <NuxtLink to="/" class="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-[var(--accent-glow)]">
        Jelajahi Anime
      </NuxtLink>
    </div>

    <!-- Subscriptions Grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <div
        v-for="(anime, idx) in subItems"
        :key="anime.animeSlug"
        class="group relative anim-fade-up"
        :style="{ animationDelay: `${idx * 0.04}s` }"
      >
        <div class="relative rounded-2xl overflow-hidden aspect-[3/4] bg-[var(--bg-card)] border border-[var(--border-subtle)] card-hover card-glow">
          <img :src="anime.cover" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>

          <!-- Unsubscribe Button -->
          <button
            @click.stop.prevent="handleUnsub({ slug: anime.animeSlug, title: anime.animeTitle, cover: anime.cover })"
            class="absolute top-2.5 right-2.5 p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/20 text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-lg active:scale-95"
            title="Batal Subscribe"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>

          <!-- Rating badge -->
          <div v-if="anime.rating" class="absolute top-2.5 left-2.5">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-amber-400 text-[10px] font-bold">
              ⭐ {{ anime.rating }}
            </span>
          </div>

          <!-- Link Area -->
          <NuxtLink :to="`/anime/${anime.animeSlug}`" class="absolute inset-0 z-0"></NuxtLink>
        </div>

        <NuxtLink :to="`/anime/${anime.animeSlug}`" class="block mt-2">
          <p class="text-xs text-[var(--text-secondary)] group-hover:text-white transition-colors font-semibold line-clamp-2 leading-relaxed">
            {{ anime.animeTitle }}
          </p>
        </NuxtLink>
      </div>
    </div>

  </div>
</template>
