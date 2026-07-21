<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from '#app'

const router = useRouter()
const searchQuery = ref('')
const homeLoading = ref(true)
const recentReleases = ref([])
const popularAnime = ref([])
const historyList = ref([])

onMounted(async () => {
  loadHistory()
  await fetchHomeFeed()
})

async function fetchHomeFeed() {
  try {
    const data = await $fetch('/api/home')
    if (data.success) {
      recentReleases.value = data.recentReleases
      popularAnime.value = data.popularAnime
    }
  } catch (err) {
    console.error('Failed to load home feed:', err)
  } finally {
    homeLoading.value = false
  }
}

function loadHistory() {
  try {
    const data = localStorage.getItem('vnime_history')
    if (data) historyList.value = JSON.parse(data)
  } catch (e) {}
}

function clearHistory() {
  historyList.value = []
  localStorage.removeItem('vnime_history')
}

function handleSearch() {
  const q = searchQuery.value.trim()
  if (q) router.push({ path: '/search', query: { q } })
}
</script>

<template>
  <div class="w-full">

    <!-- ===== HERO SECTION ===== -->
    <section class="relative overflow-hidden">
      <!-- Gradient Background -->
      <div class="absolute inset-0 bg-gradient-to-b from-[var(--accent)]/[0.08] via-[var(--bg-primary)] to-[var(--bg-primary)]"></div>
      <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[var(--accent)]/[0.06] rounded-full blur-[120px] pointer-events-none"></div>

      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-10 sm:pt-16 sm:pb-14">
        <div class="max-w-2xl space-y-6 anim-fade-up">
          <div class="space-y-3">
            <h1 class="text-3xl sm:text-4xl font-extrabold text-white leading-tight tracking-tight">
              Nonton Anime<br />
              <span class="bg-gradient-to-r from-[var(--accent)] to-purple-400 bg-clip-text text-transparent">Sub Indo Gratis</span>
            </h1>
            <p class="text-[var(--text-secondary)] text-sm sm:text-base leading-relaxed max-w-lg">
              Streaming anime dari berbagai sumber terpercaya, tanpa iklan. Kualitas terbaik hingga 1080p.
            </p>
          </div>

          <!-- Search Bar -->
          <form @submit.prevent="handleSearch" class="flex gap-2.5 max-w-lg">
            <div class="relative flex-1">
              <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
              </div>
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Cari judul anime..."
                class="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-glow)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all duration-200"
              />
            </div>
            <button
              type="submit"
              class="px-6 py-3 bg-gradient-to-r from-[var(--accent)] to-purple-600 hover:from-[var(--accent-hover)] hover:to-purple-500 text-white text-sm font-bold rounded-xl transition-all duration-200 shadow-lg shadow-[var(--accent-glow)] hover:shadow-[var(--accent-glow-strong)] active:scale-95"
            >Cari</button>
          </form>

          <!-- Quick Tags -->
          <div class="flex flex-wrap gap-2">
            <button
              v-for="tag in ['Mushoku Tensei', 'Solo Leveling', 'One Piece', 'Naruto', 'Bleach']"
              :key="tag"
              @click="searchQuery = tag; handleSearch()"
              class="px-3.5 py-1.5 rounded-lg bg-white/[0.04] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-white text-xs font-medium transition-all duration-200 hover:bg-white/[0.08] active:scale-95"
            >{{ tag }}</button>
          </div>
        </div>
      </div>
    </section>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 pb-12 space-y-12">

      <!-- ===== CONTINUE WATCHING ===== -->
      <section v-if="historyList.length > 0" class="space-y-5 anim-fade-up anim-delay-1">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-1 h-6 rounded-full bg-gradient-to-b from-[var(--accent)] to-purple-600"></div>
            <h2 class="text-base sm:text-lg font-bold text-white">Lanjutkan Nonton</h2>
          </div>
          <button @click="clearHistory" class="text-xs text-[var(--text-muted)] hover:text-red-400 transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-red-500/10">Hapus Semua</button>
        </div>

        <div class="flex gap-3 overflow-x-auto scroll-hidden pb-2">
          <NuxtLink
            v-for="item in historyList"
            :key="item.animeSlug"
            :to="`/anime/${item.animeSlug}`"
            class="group shrink-0 w-32 sm:w-36"
          >
            <div class="relative rounded-xl overflow-hidden aspect-[3/4] bg-[var(--bg-card)] border border-[var(--border-subtle)] card-hover">
              <img :src="item.cover" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
              <div class="absolute bottom-0 inset-x-0 p-2.5">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent)]/20 text-[var(--accent-hover)] text-[10px] font-bold">
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  Eps {{ item.lastEpisodeNumber }}
                </span>
              </div>
            </div>
            <p class="text-xs text-[var(--text-secondary)] mt-2 line-clamp-2 group-hover:text-white transition-colors font-medium leading-relaxed">{{ item.animeTitle }}</p>
          </NuxtLink>
        </div>
      </section>

      <!-- ===== MAIN GRID: RECENT + TOP 10 ===== -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-12">

        <!-- Recent Releases -->
        <section class="lg:col-span-2 space-y-5 anim-fade-up anim-delay-2">
          <div class="flex items-center gap-3">
            <div class="w-1 h-6 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600"></div>
            <h2 class="text-base sm:text-lg font-bold text-white">Episode Terbaru</h2>
          </div>

          <!-- Skeleton -->
          <div v-if="homeLoading" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            <div v-for="i in 10" :key="i" class="space-y-2.5">
              <div class="skeleton aspect-[3/4] rounded-xl"></div>
              <div class="skeleton h-3 w-3/4 rounded"></div>
              <div class="skeleton h-2.5 w-1/2 rounded"></div>
            </div>
          </div>

          <!-- Cards -->
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            <NuxtLink
              v-for="(ep, idx) in recentReleases"
              :key="ep.episodeSlug"
              :to="`/episode/${ep.episodeSlug}`"
              class="group anim-fade-up"
              :style="{ animationDelay: `${idx * 0.04}s` }"
            >
              <div class="relative rounded-xl overflow-hidden aspect-[3/4] bg-[var(--bg-card)] border border-[var(--border-subtle)] card-hover card-glow">
                <img :src="ep.cover" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>

                <!-- Episode Badge -->
                <div class="absolute top-2 left-2">
                  <span class="px-2 py-0.5 rounded-md bg-[var(--accent)] text-white text-[10px] font-bold shadow-lg">
                    EP {{ ep.episodeNumber }}
                  </span>
                </div>

                <!-- Time Badge -->
                <div class="absolute bottom-0 inset-x-0 p-2.5">
                  <p class="text-[10px] text-white/60 font-medium">{{ ep.releasedTime }}</p>
                </div>
              </div>
              <p class="text-xs text-[var(--text-secondary)] mt-2 line-clamp-2 group-hover:text-white transition-colors font-medium leading-relaxed">{{ ep.title }}</p>
            </NuxtLink>
          </div>
        </section>

        <!-- Top 10 Weekly -->
        <section class="space-y-5 anim-fade-up anim-delay-3">
          <div class="flex items-center gap-3">
            <div class="w-1 h-6 rounded-full bg-gradient-to-b from-amber-400 to-orange-500"></div>
            <h2 class="text-base sm:text-lg font-bold text-white">Top 10 Minggu Ini</h2>
          </div>

          <!-- Skeleton -->
          <div v-if="homeLoading" class="space-y-2.5">
            <div v-for="i in 10" :key="i" class="flex items-center gap-3 p-3">
              <div class="skeleton w-6 h-6 rounded-md shrink-0"></div>
              <div class="skeleton w-11 h-14 rounded-lg shrink-0"></div>
              <div class="flex-1 space-y-1.5">
                <div class="skeleton h-3 w-3/4 rounded"></div>
                <div class="skeleton h-2.5 w-1/2 rounded"></div>
              </div>
            </div>
          </div>

          <!-- List -->
          <div v-else class="space-y-1">
            <NuxtLink
              v-for="(anime, idx) in popularAnime"
              :key="anime.slug"
              :to="`/anime/${anime.slug}`"
              class="group flex items-center gap-3.5 p-3 rounded-xl hover:bg-white/[0.03] transition-all duration-200 anim-fade-up"
              :style="{ animationDelay: `${idx * 0.05}s` }"
            >
              <!-- Rank -->
              <span
                class="text-lg font-extrabold w-7 text-center shrink-0 tabular-nums"
                :class="idx < 3 ? 'bg-gradient-to-b from-amber-400 to-orange-500 bg-clip-text text-transparent' : 'text-[var(--text-muted)]'"
              >{{ idx + 1 }}</span>

              <!-- Cover -->
              <div class="w-11 h-14 rounded-lg overflow-hidden shrink-0 bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                <img :src="anime.cover" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
              </div>

              <!-- Info -->
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-[var(--text-primary)] group-hover:text-white transition-colors truncate">{{ anime.title }}</p>
                <p class="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">{{ anime.genres?.slice(0, 3).join(' · ') }}</p>
              </div>

              <!-- Arrow -->
              <svg class="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0 opacity-0 group-hover:opacity-100" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
            </NuxtLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
