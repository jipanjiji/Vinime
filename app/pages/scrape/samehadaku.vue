<script setup>
import { ref, nextTick } from 'vue'

const targetUrl = ref('')
const isLoading = ref(false)
const errorMsg = ref('')
const sources = ref([])
const activeSource = ref(null)
const playUrl = ref('')
const useProxy = ref(true)

let hlsInstance = null

function destroyHls() {
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }
}

async function handleScrape() {
  if (!targetUrl.value) return
  isLoading.value = true
  errorMsg.value = ''
  sources.value = []
  activeSource.value = null
  playUrl.value = ''
  destroyHls()

  try {
    const data = await $fetch(`/api/scrape/samehadaku?url=${encodeURIComponent(targetUrl.value)}`)
    if (data.success) {
      sources.value = data.videoSources
    } else {
      errorMsg.value = data.message || 'Gagal melakukan scraping.'
    }
  } catch (err) {
    errorMsg.value = err.message || 'Koneksi gagal.'
  } finally {
    isLoading.value = false
  }
}

async function handlePlay(src) {
  activeSource.value = src
  playUrl.value = ''
  destroyHls()

  try {
    const resolveData = await $fetch(`/api/resolve?url=${encodeURIComponent(src.url)}`)
    if (resolveData.success) {
      const rawUrl = resolveData.rawVideoUrl
      
      const isDirectPlay = rawUrl.includes('wibufile.com') || rawUrl.includes('archive.org') ||
        rawUrl.includes('pixeldrain.com') || rawUrl.includes('cloudflarestorage.com') ||
        rawUrl.includes('filedon') || rawUrl.includes('gofile.io')
      
      const mustProxy = useProxy.value || !isDirectPlay
      playUrl.value = mustProxy
        ? `/api/proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(src.url)}`
        : rawUrl

      nextTick(() => {
        const videoEl = document.getElementById('debug-player')
        if (!videoEl) return

        if (rawUrl.includes('m3u8')) {
          if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hlsInstance = new Hls()
            hlsInstance.loadSource(playUrl.value)
            hlsInstance.attachMedia(videoEl)
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
              videoEl.play().catch(() => {})
            })
          } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            videoEl.src = playUrl.value
            videoEl.play().catch(() => {})
          }
        } else {
          videoEl.src = playUrl.value
          videoEl.load()
          videoEl.play().catch(() => {})
        }
      })
    } else {
      alert('Gagal menyelesaikan tautan video mentah.')
    }
  } catch (err) {
    alert(`Error: ${err.message}`)
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-xl font-bold text-[#e2e2f0] mb-1">Samehadaku Direct Scraper</h1>
      <p class="text-xs text-[#7c7c9a]">Gunakan halaman ini untuk melakukan debugging dan mengekstrak tautan video dari Samehadaku secara langsung.</p>
    </div>

    <!-- Input Card -->
    <div class="bg-[#13131e] border border-[#1f1f2e] rounded-lg p-5 mb-6">
      <div class="flex flex-col gap-3">
        <label class="text-xs text-[#7c7c9a] font-semibold">URL Halaman Episode Samehadaku</label>
        <div class="flex gap-2">
          <input
            type="text"
            placeholder="Contoh: https://v2.samehadaku.how/solo-leveling-season-2-arise-from-the-shadow-episode-13-end/"
            v-model="targetUrl"
            class="flex-1 bg-[#0c0c14] border border-[#1f1f2e] text-[#e2e2f0] rounded px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
          />
          <button
            @click="handleScrape"
            :disabled="isLoading"
            class="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded transition-colors"
          >
            {{ isLoading ? 'Mengekstrak...' : 'Scrape Link' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Error Msg -->
    <div v-if="errorMsg" class="bg-red-950/20 border border-red-900/50 text-red-400 rounded-lg p-4 mb-6 text-xs">
      {{ errorMsg }}
    </div>

    <!-- Results section -->
    <div v-if="sources.length > 0" class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Sources List -->
      <div class="lg:col-span-5 flex flex-col gap-4">
        <h2 class="text-xs font-bold text-[#7c7c9a] uppercase tracking-wider">Hasil Pencocokan Cermin</h2>
        <div class="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
          <div
            v-for="(src, idx) in sources"
            :key="idx"
            @click="handlePlay(src)"
            class="p-3 bg-[#13131e] border border-[#1f1f2e] rounded-lg cursor-pointer hover:border-indigo-500 transition-colors flex flex-col gap-1"
            :class="{ 'border-indigo-500 bg-indigo-950/10': activeSource?.url === src.url }"
          >
            <div class="text-xs font-bold text-[#e2e2f0]">{{ src.label }}</div>
            <div class="text-[10px] text-[#7c7c9a] break-all">{{ src.url }}</div>
          </div>
        </div>
      </div>

      <!-- Player / Resolver Details -->
      <div class="lg:col-span-7 flex flex-col gap-4">
        <h2 class="text-xs font-bold text-[#7c7c9a] uppercase tracking-wider">Debugger Player</h2>
        
        <div class="bg-[#13131e] border border-[#1f1f2e] rounded-lg p-4 flex flex-col gap-4">
          <!-- Proxy Toggle -->
          <div class="flex items-center justify-between border-b border-[#1f1f2e] pb-3">
            <span class="text-xs text-[#e2e2f0]">Gunakan Server Proxy Node</span>
            <input type="checkbox" v-model="useProxy" class="h-4 w-4" />
          </div>

          <!-- Video element -->
          <div v-if="playUrl" class="relative bg-black rounded overflow-hidden aspect-video border border-[#1f1f2e]">
            <video id="debug-player" controls class="w-full h-full object-contain"></video>
          </div>
          <div v-else class="bg-[#0c0c14] border border-[#1f1f2e] rounded aspect-video flex items-center justify-center text-xs text-[#44445a]">
            Klik salah satu server cermin untuk memulai pemutaran uji coba.
          </div>

          <!-- Play url detail -->
          <div v-if="playUrl" class="flex flex-col gap-1">
            <span class="text-[10px] text-[#7c7c9a] font-bold">Resolved Play URL:</span>
            <div class="bg-[#0c0c14] p-2 border border-[#1f1f2e] rounded text-[10px] text-slate-350 break-all select-all font-mono">
              {{ playUrl }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
