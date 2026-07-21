<script setup>
import { ref, onMounted } from 'vue'
import { getHistoryList, removeHistoryItem, clearAllHistory, formatSeconds } from '~/utils/storage'

const historyItems = ref([])

onMounted(() => {
  loadHistory()
})

function loadHistory() {
  historyItems.value = getHistoryList()
}

function handleRemoveItem(slug) {
  removeHistoryItem(slug)
  loadHistory()
}

function handleClearAll() {
  if (confirm('Apakah Anda yakin ingin menghapus semua riwayat nonton?')) {
    clearAllHistory()
    loadHistory()
  }
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">

    <!-- Header -->
    <div class="flex items-center justify-between anim-fade-up">
      <div class="space-y-1">
        <h1 class="text-2xl sm:text-3xl font-extrabold text-white">Riwayat Nonton</h1>
        <p class="text-sm text-[var(--text-secondary)]">Daftar anime yang pernah Anda tonton beserta menit terakhirnya</p>
      </div>

      <button
        v-if="historyItems.length > 0"
        @click="handleClearAll"
        class="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold transition-all"
      >Hapus Semua</button>
    </div>

    <!-- Empty State -->
    <div v-if="historyItems.length === 0" class="text-center py-20 anim-fade-up">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] mb-4">
        <svg class="w-7 h-7 text-[var(--text-muted)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
      </div>
      <p class="text-[var(--text-secondary)] text-sm font-medium">Belum ada riwayat nonton</p>
      <p class="text-[var(--text-muted)] text-xs mt-1">Nonton anime favorit Anda untuk mulai menyimpan riwayat</p>
      <NuxtLink to="/" class="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-[var(--accent-glow)]">
        Mulai Nonton
      </NuxtLink>
    </div>

    <!-- History Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="(item, idx) in historyItems"
        :key="item.animeSlug"
        class="group relative rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 flex gap-4 card-hover anim-fade-up"
        :style="{ animationDelay: `${idx * 0.04}s` }"
      >
        <!-- Poster -->
        <NuxtLink :to="`/episode/${item.lastEpisodeSlug}?t=${item.lastTime}`" class="relative w-24 h-32 rounded-xl overflow-hidden bg-[var(--bg-elevated)] shrink-0 border border-[var(--border-subtle)] group-hover:border-[var(--accent)]/40 transition-colors">
          <img :src="item.cover" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
          
          <!-- Play Icon overlay -->
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
            <div class="w-9 h-9 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-lg">
              <svg class="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        </NuxtLink>

        <!-- Info -->
        <div class="flex flex-col justify-between flex-1 min-w-0 py-0.5">
          <div class="space-y-1.5">
            <NuxtLink :to="`/anime/${item.animeSlug}`" class="text-sm font-bold text-white hover:text-[var(--accent)] transition-colors line-clamp-2 leading-snug">
              {{ item.animeTitle }}
            </NuxtLink>
            <p class="text-xs text-[var(--accent)] font-semibold">
              Episode {{ item.lastEpisodeNumber }}
            </p>
          </div>

          <!-- Progress Bar & Actions -->
          <div class="space-y-2.5">
            <!-- Time Indicator -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-[11px] font-medium text-[var(--text-muted)]">
                <span>{{ formatSeconds(item.lastTime) }} / {{ formatSeconds(item.duration) }}</span>
                <span v-if="item.duration > 0" class="text-[10px] text-[var(--accent)] font-bold">
                  {{ Math.min(100, Math.round((item.lastTime / item.duration) * 100)) }}%
                </span>
              </div>
              <!-- Red progress bar line -->
              <div class="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  class="h-full bg-red-500 rounded-full transition-all"
                  :style="{ width: `${item.duration ? Math.min(100, (item.lastTime / item.duration) * 100) : 0}%` }"
                ></div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center justify-between pt-1">
              <NuxtLink
                :to="`/episode/${item.lastEpisodeSlug}?t=${item.lastTime}`"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-all shadow-sm"
              >
                <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                Lanjut
              </NuxtLink>

              <button
                @click="handleRemoveItem(item.animeSlug)"
                class="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Hapus dari riwayat"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
