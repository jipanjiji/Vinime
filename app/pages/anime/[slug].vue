<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from '#app'
import { getAnimeHistory, isSubscribed, toggleSubscription, formatSeconds } from '~/utils/storage'

const route = useRoute()
const slug = route.params.slug

const detailLoading = ref(true)
const animeDetails = ref(null)
const errorMsg = ref('')
const showFullSynopsis = ref(false)

const watchHistory = ref(null)
const subscribed = ref(false)

const sortOrder = ref('asc') // 'asc' = Terlama -> Terbaru, 'desc' = Terbaru -> Terlama

const sortedEpisodes = computed(() => {
  if (!animeDetails.value?.episodes) return []
  const eps = [...animeDetails.value.episodes]
  if (sortOrder.value === 'desc') {
    return eps.reverse()
  }
  return eps
})

onMounted(async () => {
  watchHistory.value = getAnimeHistory(slug)
  subscribed.value = isSubscribed(slug)
  await fetchAnimeDetails()
})

import { fetchClientAnimeDetail } from '~/utils/clientScraper'

async function fetchAnimeDetails() {
  detailLoading.value = true
  errorMsg.value = ''
  try {
    const data = await $fetch(`/api/anime?slug=${encodeURIComponent(slug)}`).catch(() => null)
    if (data?.success && data.title) {
      animeDetails.value = data
      subscribed.value = isSubscribed(slug)
      return
    }

    const clientData = await fetchClientAnimeDetail(slug)
    if (clientData?.success) {
      animeDetails.value = clientData
      subscribed.value = isSubscribed(slug)
    } else {
      errorMsg.value = 'Gagal memuat detail anime.'
    }
  } catch (err) {
    errorMsg.value = err.message || 'Terjadi kesalahan.'
  } finally {
    detailLoading.value = false
  }
}

function handleToggleSubscribe() {
  if (!animeDetails.value) return
  subscribed.value = toggleSubscription({
    slug,
    title: animeDetails.value.title,
    cover: animeDetails.value.cover,
    type: animeDetails.value.type,
    score: animeDetails.value.score
  })
}

function cleanTitle(t) {
  return (t || '').replace('Nonton Anime ', '').replace('Sub Indo', '').trim()
}
</script>

<template>
  <div class="w-full">

    <!-- Loading Skeleton -->
    <div v-if="detailLoading" class="w-full">
      <div class="relative h-64 sm:h-80 skeleton rounded-none"></div>
      <div class="max-w-7xl mx-auto px-4 sm:px-6 -mt-20 relative z-10 space-y-6">
        <div class="flex gap-5">
          <div class="skeleton w-36 h-52 rounded-xl shrink-0"></div>
          <div class="flex-1 space-y-3 pt-8">
            <div class="skeleton h-6 w-3/4 rounded-lg"></div>
            <div class="skeleton h-4 w-1/3 rounded"></div>
            <div class="flex gap-2">
              <div class="skeleton h-6 w-16 rounded-lg" v-for="i in 4" :key="i"></div>
            </div>
            <div class="skeleton h-3 w-full rounded" v-for="i in 3" :key="i"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="max-w-7xl mx-auto px-4 sm:px-6 py-20">
      <div class="max-w-md mx-auto text-center space-y-4 anim-fade-up">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-2">
          <svg class="w-7 h-7 text-red-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
        </div>
        <p class="text-sm text-red-400 font-medium">{{ errorMsg }}</p>
        <NuxtLink to="/" class="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
          Kembali ke Beranda
        </NuxtLink>
      </div>
    </div>

    <!-- Content -->
    <div v-else-if="animeDetails">

      <!-- Hero Banner with Blurred Cover -->
      <div class="relative overflow-hidden">
        <!-- Blurred Background -->
        <div class="absolute inset-0">
          <img :src="animeDetails.cover" class="w-full h-full object-cover scale-110 blur-2xl opacity-30" />
          <div class="absolute inset-0 bg-gradient-to-b from-[var(--bg-primary)]/50 via-[var(--bg-primary)]/70 to-[var(--bg-primary)]"></div>
        </div>

        <!-- Content Over Hero -->
        <div class="relative max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-10 sm:pt-12 sm:pb-14">
          <!-- Back Link -->
          <NuxtLink to="/" class="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-white font-medium transition-colors mb-6 anim-fade-down">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
            Beranda
          </NuxtLink>

          <div class="flex flex-col sm:flex-row gap-6 sm:gap-8 anim-fade-up">
            <!-- Poster -->
            <div class="shrink-0 flex justify-center sm:block">
              <div class="relative">
                <img
                  :src="animeDetails.cover"
                  class="w-40 h-56 sm:w-48 sm:h-68 object-cover rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl shadow-black/40"
                />
                <!-- Score badge -->
                <div class="absolute -bottom-3 left-1/2 -translate-x-1/2">
                  <span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-amber-400 text-xs font-bold shadow-lg">
                    ⭐ {{ animeDetails.score || '0.0' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Metadata -->
            <div class="flex flex-col justify-between space-y-4 text-center sm:text-left pt-2 sm:pt-0">
              <div class="space-y-3">
                <h1 class="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-snug tracking-tight">
                  {{ cleanTitle(animeDetails.title) }}
                </h1>

                <div class="flex items-center justify-center sm:justify-start gap-3 flex-wrap text-sm">
                  <span class="text-[var(--text-secondary)] font-medium">{{ animeDetails.episodes?.length || 0 }} Episode</span>
                  <span v-if="animeDetails.type" class="text-white/20">·</span>
                  <span v-if="animeDetails.type" class="text-[var(--text-muted)] uppercase text-xs font-bold">{{ animeDetails.type }}</span>
                </div>

                <!-- Genre Pills -->
                <div class="flex flex-wrap justify-center sm:justify-start gap-2">
                  <span
                    v-for="g in animeDetails.genres"
                    :key="g"
                    class="text-[11px] px-3 py-1 rounded-lg bg-white/[0.05] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium"
                  >{{ g }}</span>
                </div>
              </div>

              <!-- ===== PLAY & SUBSCRIBE ACTION BUTTONS ===== -->
              <div class="flex flex-col items-center sm:items-start gap-2 pt-2">
                <div class="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                  <!-- Play / Resume Button -->
                  <NuxtLink
                    v-if="watchHistory && watchHistory.lastEpisodeSlug"
                    :to="`/episode/${watchHistory.lastEpisodeSlug}?t=${watchHistory.lastTime}`"
                    class="px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-extrabold flex items-center gap-2 transition-all shadow-lg shadow-sky-500/20 active:scale-95"
                  >
                    <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span>Lanjut Nonton Eps {{ watchHistory.lastEpisodeNumber }}</span>
                  </NuxtLink>

                  <NuxtLink
                    v-else-if="animeDetails.episodes && animeDetails.episodes.length > 0"
                    :to="`/episode/${animeDetails.episodes[0].slug}`"
                    class="px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-extrabold flex items-center gap-2 transition-all shadow-lg shadow-sky-500/20 active:scale-95"
                  >
                    <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    <span>Mulai Nonton</span>
                  </NuxtLink>

                  <!-- Subscribe Button -->
                  <button
                    @click="handleToggleSubscribe"
                    class="px-5 py-3 rounded-2xl border text-sm font-bold flex items-center gap-2 transition-all active:scale-95 shadow-md"
                    :class="subscribed
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/20'
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/15'"
                  >
                    <svg v-if="subscribed" class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
                    <svg v-else class="w-4 h-4 fill-none stroke-current stroke-2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"/></svg>
                    <span>{{ subscribed ? 'Subscribed' : 'Subscribe' }}</span>
                  </button>
                </div>

                <!-- Time subtext -->
                <span v-if="watchHistory && watchHistory.lastTime" class="text-[11px] text-[var(--text-muted)] font-medium mt-0.5 ml-1">
                  Terakhir ditonton: {{ formatSeconds(watchHistory.lastTime) }} / {{ formatSeconds(watchHistory.duration) }}
                </span>
              </div>

              <!-- Synopsis -->
              <div class="max-w-2xl pt-2">
                <p
                  class="text-sm text-[var(--text-secondary)] leading-relaxed"
                  :class="showFullSynopsis ? '' : 'line-clamp-3'"
                >{{ animeDetails.synopsis || 'Tidak ada sinopsis.' }}</p>
                <button
                  v-if="animeDetails.synopsis && animeDetails.synopsis.length > 200"
                  @click="showFullSynopsis = !showFullSynopsis"
                  class="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium mt-1.5 transition-colors"
                >{{ showFullSynopsis ? 'Tutup' : 'Baca selengkapnya...' }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Episode List Section -->
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-5 anim-fade-up anim-delay-2">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-1 h-6 rounded-full bg-gradient-to-b from-[var(--accent)] to-purple-600"></div>
            <h2 class="text-base sm:text-lg font-bold text-white">Daftar Episode</h2>
            <span v-if="animeDetails.episodes?.length" class="text-xs text-[var(--text-muted)] font-medium ml-1">{{ animeDetails.episodes.length }} eps</span>
          </div>

          <!-- Sort Toggle Button -->
          <button
            v-if="animeDetails.episodes?.length > 1"
            @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
            class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-white transition-all flex items-center gap-1.5 active:scale-95"
            title="Ubah Urutan Episode"
          >
            <svg class="w-3.5 h-3.5 text-[var(--accent)] transition-transform duration-300" :class="sortOrder === 'desc' ? 'rotate-180' : ''" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-3L16.5 21m0 0L12 16.5m4.5 4.5V7.5"/></svg>
            <span>{{ sortOrder === 'asc' ? 'Terlama → Terbaru' : 'Terbaru → Terlama' }}</span>
          </button>
        </div>

        <div v-if="!animeDetails.episodes || animeDetails.episodes.length === 0" class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-12 text-center">
          <p class="text-sm text-[var(--text-muted)] italic">Belum ada episode tersedia.</p>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NuxtLink
            v-for="(ep, idx) in sortedEpisodes"
            :key="ep.slug"
            :to="`/episode/${ep.slug}${watchHistory?.episodesProgress?.[ep.slug]?.lastTime ? `?t=${watchHistory.episodesProgress[ep.slug].lastTime}` : ''}`"
            class="group relative flex items-center justify-between px-5 py-4 rounded-2xl border bg-[var(--bg-card)]/70 hover:bg-[var(--bg-elevated)] transition-all duration-200 card-hover overflow-hidden"
            :class="watchHistory?.episodesProgress?.[ep.slug]
              ? 'border-red-500/30 bg-red-500/5'
              : 'border-[var(--border-subtle)] hover:border-[var(--accent)]/40'"
          >
            <!-- Left: Episode number & Date -->
            <div class="space-y-1">
              <p class="text-sm sm:text-base font-bold text-white group-hover:text-[var(--accent)] transition-colors">
                Episode {{ ep.episodeNumber }}
              </p>
              <p v-if="ep.date" class="text-xs text-[var(--text-muted)] font-medium">
                {{ ep.date }}
              </p>
            </div>

            <!-- Right: Watch Progress Time or Arrow -->
            <div class="flex items-center gap-3">
              <span v-if="watchHistory?.episodesProgress?.[ep.slug]" class="text-xs sm:text-sm font-semibold text-white/90 tabular-nums">
                {{ formatSeconds(watchHistory.episodesProgress[ep.slug].lastTime) }}/{{ formatSeconds(watchHistory.episodesProgress[ep.slug].duration) }}
              </span>
              <svg class="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
            </div>

            <!-- Bottom Red Progress Bar -->
            <div v-if="watchHistory?.episodesProgress?.[ep.slug]" class="absolute bottom-0 inset-x-0 h-1 bg-white/10 overflow-hidden">
              <div
                class="h-full bg-red-500 rounded-full transition-all"
                :style="{ width: `${watchHistory.episodesProgress[ep.slug].duration ? Math.min(100, (watchHistory.episodesProgress[ep.slug].lastTime / watchHistory.episodesProgress[ep.slug].duration) * 100) : 0}%` }"
              ></div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>

  </div>
</template>
